#pragma once
// A small entity-component registry with sparse-set storage.
//
// Entities are plain ids; components are plain structs stored densely per type.
// A system that needs "every entity with a Schedule and a Supply" walks packed
// arrays instead of chasing pointers through an object graph, and adding a new
// analysis means adding a component and a system — nothing existing changes.
//
// Rule: inside each<A, B...>(), don't add or remove A/B components (other
// component types are fine). Systems only ever write *output* components.

#include <cstdint>
#include <limits>
#include <memory>
#include <tuple>
#include <type_traits>
#include <utility>
#include <vector>

namespace dosely::ecs {

struct Entity {
  uint32_t index = std::numeric_limits<uint32_t>::max();
  uint32_t generation = 0;
  bool operator==(const Entity&) const = default;
};

namespace detail {
inline size_t nextTypeId() {
  static size_t counter = 0;
  return counter++;
}
template <class T>
size_t typeId() {
  static const size_t id = nextTypeId();
  return id;
}
}  // namespace detail

class IPool {
 public:
  virtual ~IPool() = default;
  virtual void remove(uint32_t index) = 0;
  virtual void clear() = 0;
};

template <class T>
class Pool final : public IPool {
 public:
  bool contains(uint32_t i) const { return i < sparse_.size() && sparse_[i] != kNone; }

  T& put(Entity e, T value) {
    if (contains(e.index)) return data_[sparse_[e.index]] = std::move(value);
    if (e.index >= sparse_.size()) sparse_.resize(e.index + 1, kNone);
    sparse_[e.index] = static_cast<uint32_t>(dense_.size());
    dense_.push_back(e);
    data_.push_back(std::move(value));
    return data_.back();
  }

  T* get(uint32_t i) { return contains(i) ? &data_[sparse_[i]] : nullptr; }
  const T* get(uint32_t i) const { return contains(i) ? &data_[sparse_[i]] : nullptr; }

  void remove(uint32_t i) override {
    if (!contains(i)) return;
    const uint32_t slot = sparse_[i];
    const uint32_t last = static_cast<uint32_t>(dense_.size() - 1);
    if (slot != last) {  // swap-remove keeps storage packed
      dense_[slot] = dense_[last];
      data_[slot] = std::move(data_[last]);
      sparse_[dense_[slot].index] = slot;
    }
    dense_.pop_back();
    data_.pop_back();
    sparse_[i] = kNone;
  }

  void clear() override {
    sparse_.clear();
    dense_.clear();
    data_.clear();
  }

  size_t size() const { return dense_.size(); }
  const std::vector<Entity>& entities() const { return dense_; }

 private:
  static constexpr uint32_t kNone = std::numeric_limits<uint32_t>::max();
  std::vector<uint32_t> sparse_;
  std::vector<Entity> dense_;
  std::vector<T> data_;
};

class Registry {
 public:
  Entity create() {
    if (!free_.empty()) {
      const uint32_t i = free_.back();
      free_.pop_back();
      return {i, generations_[i]};
    }
    generations_.push_back(0);
    return {static_cast<uint32_t>(generations_.size() - 1), 0};
  }

  bool alive(Entity e) const { return e.index < generations_.size() && generations_[e.index] == e.generation; }

  void destroy(Entity e) {
    if (!alive(e)) return;
    for (auto& p : pools_) {
      if (p) p->remove(e.index);
    }
    ++generations_[e.index];  // stale handles to this slot stop resolving
    free_.push_back(e.index);
  }

  template <class T>
  T& add(Entity e, T value) {
    return pool<T>().put(e, std::move(value));
  }

  template <class T>
  T* get(Entity e) {
    return alive(e) ? pool<T>().get(e.index) : nullptr;
  }

  template <class T>
  bool has(Entity e) const {
    const auto id = detail::typeId<T>();
    return alive(e) && id < pools_.size() && pools_[id] && static_cast<const Pool<T>&>(*pools_[id]).contains(e.index);
  }

  template <class T>
  void remove(Entity e) {
    if (alive(e)) pool<T>().remove(e.index);
  }

  /** Visit every entity that has all of First, Rest...: f(entity, first&, rest&...). */
  template <class First, class... Rest, class F>
  void each(F&& f) {
    auto& lead = pool<First>();
    // Index loop over a snapshot of the size: callbacks may add *other* components.
    const size_t n = lead.size();
    for (size_t k = 0; k < n; ++k) {
      const Entity e = lead.entities()[k];
      First* a = lead.get(e.index);
      if constexpr (sizeof...(Rest) == 0) {
        f(e, *a);
      } else {
        auto others = std::make_tuple(pool<Rest>().get(e.index)...);
        const bool all = std::apply([](auto*... p) { return ((p != nullptr) && ...); }, others);
        if (all) std::apply([&](auto*... p) { f(e, *a, *p...); }, others);
      }
    }
  }

  /** A singleton shared by systems — e.g. the worklist they produce. */
  template <class T>
  T& resource() {
    const auto id = detail::typeId<T>();
    if (id >= resources_.size()) resources_.resize(id + 1);
    if (!resources_[id]) resources_[id] = std::make_unique<Holder<T>>();
    return static_cast<Holder<T>&>(*resources_[id]).value;
  }

  size_t aliveCount() const { return generations_.size() - free_.size(); }

  /** Drop every entity, component and resource. */
  void clear() {
    pools_.clear();
    resources_.clear();
    generations_.clear();
    free_.clear();
  }

 private:
  struct IHolder {
    virtual ~IHolder() = default;
  };
  template <class T>
  struct Holder final : IHolder {
    T value{};
  };

  template <class T>
  Pool<T>& pool() {
    const auto id = detail::typeId<T>();
    if (id >= pools_.size()) pools_.resize(id + 1);
    if (!pools_[id]) pools_[id] = std::make_unique<Pool<T>>();
    return static_cast<Pool<T>&>(*pools_[id]);
  }

  std::vector<uint32_t> generations_;
  std::vector<uint32_t> free_;
  std::vector<std::unique_ptr<IPool>> pools_;
  std::vector<std::unique_ptr<IHolder>> resources_;
};

}  // namespace dosely::ecs
