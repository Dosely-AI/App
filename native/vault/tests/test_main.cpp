// Runs every registered test. Optional argument: substring filter on names.

#include <cstring>

#include "harness.hpp"

int main(int argc, char** argv) {
  using namespace dosely::test;
  const char* filter = argc > 1 ? argv[1] : nullptr;
  int ran = 0;
  int failedCases = 0;
  for (const auto& c : cases()) {
    if (filter && !std::strstr(c.name, filter)) continue;
    ++ran;
    const int before = failures();
#if defined(__cpp_exceptions)
    try {
      c.fn();
    } catch (const Abort&) {
      // already reported
    } catch (const std::exception& e) {
      report(__FILE__, __LINE__, std::string("uncaught exception: ") + e.what());
    }
#else
    c.fn();
#endif
    const bool ok = failures() == before;
    if (!ok) ++failedCases;
    std::fprintf(stderr, "%s %s\n", ok ? "  ok  " : "  FAIL", c.name);
  }
  std::fprintf(stderr, "\n%d/%d tests passed\n", ran - failedCases, ran);
  return failedCases == 0 && ran > 0 ? 0 : 1;
}
