import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { DoselyLogo } from '@/components/logo';
import { Screen } from '@/components/screen';
import { Spacing } from '@/constants/theme';
import { respondHybrid, type ChatTurn } from '@/lib/chat/hybrid';
import { GREETING } from '@/lib/chat/local-assistant';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

type ChatMessage = ChatTurn;

const SUGGESTIONS = [
  'What is ibuprofen used for?',
  'What’s on my schedule today?',
  'Which of my meds are running low?',
];

export default function ChatScreen() {
  const theme = useTheme();
  const medications = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;

      const next: ChatMessage[] = [...messages, { role: 'user', content }];
      setMessages(next);
      setInput('');
      setSending(true);

      const { text: reply } = await respondHybrid(next, { medications, logs });
      setSending(false);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    },
    [messages, medications, logs, sending],
  );

  const empty = messages.length === 0;

  return (
    <Screen edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        {empty ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.center}>
            <DoselyLogo size={60} />
            <Text style={[styles.greeting, { color: theme.text }]}>{GREETING}</Text>
            <Text style={[styles.greetingSub, { color: theme.textSecondary }]}>
              Ask about your medications, side effects, or anything health-related.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  style={[styles.suggestion, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                  <Text style={[styles.suggestionText, { color: theme.text }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.footer, { color: theme.textSecondary }]}>
              Medication answers stay on your device, grounded in FDA data. General information, not
              medical advice.
            </Text>
          </Animated.View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.thread}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {messages.map((m, i) => (
              <Bubble key={i} message={m} />
            ))}
            {sending ? <TypingBubble /> : null}
          </ScrollView>
        )}

        <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            placeholder="Message Dosely…"
            placeholderTextColor={theme.textSecondary}
            value={input}
            onChangeText={setInput}
            multiline
            editable={!sending}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            style={[
              styles.sendBtn,
              { backgroundColor: input.trim() && !sending ? theme.tint : theme.backgroundSelected },
            ]}>
            <Ionicons name="arrow-up" size={22} color={input.trim() && !sending ? theme.onTint : theme.textSecondary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** One message bubble — user on the right (accent), assistant on the left (card). */
function Bubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const isUser = message.role === 'user';
  return (
    <Animated.View
      entering={FadeInUp.duration(260)}
      style={[styles.bubbleRow, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
      {!isUser ? (
        <View style={styles.avatar}>
          <DoselyLogo size={26} />
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: theme.tint, borderBottomRightRadius: 4 }
            : { backgroundColor: theme.backgroundElement, borderBottomLeftRadius: 4 },
        ]}>
        <Text style={[styles.bubbleText, { color: isUser ? theme.onTint : theme.text }]}>
          {message.content}
        </Text>
      </View>
    </Animated.View>
  );
}

/** Assistant "typing" indicator with three pulsing dots. */
function TypingBubble() {
  const theme = useTheme();
  return (
    <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
      <View style={styles.avatar}>
        <DoselyLogo size={26} />
      </View>
      <View style={[styles.bubble, { backgroundColor: theme.backgroundElement, flexDirection: 'row', gap: 5 }]}>
        {[0, 1, 2].map((i) => (
          <Dot key={i} index={i} color={theme.textSecondary} />
        ))}
      </View>
    </View>
  );
}

function Dot({ index, color }: { index: number; color: string }) {
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.value = withDelay(
      index * 160,
      withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0.3, { duration: 320 })), -1, false),
    );
  }, [index, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  greeting: { fontSize: 26, fontWeight: '800', marginTop: Spacing.two },
  greetingSub: { fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: Spacing.three },
  suggestions: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.four },
  suggestion: { borderWidth: 1, borderRadius: 14, paddingVertical: Spacing.three, paddingHorizontal: Spacing.three },
  suggestionText: { fontSize: 14, fontWeight: '600' },

  footer: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: Spacing.three },

  thread: { paddingVertical: Spacing.four, gap: Spacing.three },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  avatar: { marginBottom: 2 },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  dot: { width: 7, height: 7, borderRadius: 4 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
