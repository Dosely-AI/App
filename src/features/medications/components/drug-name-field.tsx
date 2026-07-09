import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type DrugSuggestion, searchDrugs } from '@/lib/drug/rxnorm';

type Props = {
  value: string;
  onSelect: (name: string, rxcui: string | null) => void;
  error?: string;
};

/**
 * Medication name input with RxNorm autocomplete. Free text is always allowed
 * (rxcui stays null); picking a suggestion attaches the standard RxCUI so the
 * FDA lookup is more precise.
 */
export function DrugNameField({ value, onSelect, error }: Props) {
  const theme = useTheme();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const results = await searchDrugs(query, { signal: controller.signal });
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <View>
      <TextField
        label="Medication name"
        placeholder="e.g. Ibuprofen"
        autoCapitalize="words"
        autoCorrect={false}
        value={query}
        error={error}
        onChangeText={(text) => {
          setQuery(text);
          onSelect(text, null); // typing = free text until a match is picked
        }}
      />
      {open && suggestions.length > 0 ? (
        <View style={[styles.list, { backgroundColor: theme.background, borderColor: theme.border }]}>
          {suggestions.map((s) => (
            <Pressable
              key={s.rxcui}
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundElement }]}
              onPress={() => {
                setQuery(s.name);
                onSelect(s.name, s.rxcui);
                setOpen(false);
              }}>
              <Text style={{ color: theme.text }} numberOfLines={1}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  item: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
});
