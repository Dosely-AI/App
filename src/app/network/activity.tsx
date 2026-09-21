import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { CloudAccountRequired } from '@/features/auth/cloud-account-required';
import { Badge, Muted, Notice } from '@/features/care/components/care-ui';
import { useCareSession } from '@/features/care/use-care';
import { useLoad } from '@/features/care/use-load';
import { useTheme } from '@/hooks/use-theme';
import { care } from '@/lib/care/care-client';
import { Cmd, Role, type AuditJson } from '@/lib/care/protocol.gen';

const ACTIONS: Record<number, string> = {
  [Cmd.PATIENT_SUMMARY]: 'viewed your record',
  [Cmd.INVITE_REDEEM]: 'connected to your record',
  [Cmd.INVITE_CREATE]: 'created an invite',
  [Cmd.GRANT_REVOKE]: 'removed access',
  [Cmd.SNAPSHOT_PUT]: 'shared updates to your record',
  [Cmd.RX_CREATE]: 'sent you a prescription',
  [Cmd.RX_GET]: 'opened a prescription',
  [Cmd.RX_LIST]: 'listed your prescriptions',
  [Cmd.RX_SET_STATUS]: 'updated a prescription',
  [Cmd.PATIENT_ERASE]: 'erased the shared record',
};

function who(e: AuditJson, selfId: string): string {
  if (e.actorId === selfId) return 'You';
  if (e.actorName) return e.actorName;
  return e.actorRole === Role.PHARMACY ? 'A pharmacy' : e.actorRole === Role.PRESCRIBER ? 'A prescriber' : 'Someone';
}

/** Every access to the patient's shared record, newest first — including refused attempts. */
export default function ActivityScreen() {
  const theme = useTheme();
  const { session } = useCareSession();

  const { data, error } = useLoad(async () => {
    if (!session) return null;
    const [entries, integrity] = await Promise.all([care.accessLog(session.token), care.verifyLog(session.token)]);
    return { entries, intact: integrity.auditIntact === true };
  }, [session?.token]);

  if (!session) {
    return (
      <Screen edges={['bottom']}>
        <CloudAccountRequired what="Your access history" />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <FlatList
        data={data?.entries ?? []}
        keyExtractor={(e) => String(e.seq)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Notice message={error} tone="high" />
            {data ? (
              <Card>
                <View style={styles.row}>
                  <Badge label={data.intact ? 'Log verified' : 'Log integrity problem'} tone={data.intact ? 'ok' : 'high'} />
                </View>
                <Muted>
                  {data.intact
                    ? 'Each entry is sealed and chained to the one before it, so entries cannot be quietly edited or removed.'
                    : 'The access log failed its integrity check. This has been flagged for investigation.'}
                </Muted>
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={data ? <Muted>No one has accessed your shared record yet.</Muted> : null}
        renderItem={({ item: e }) => {
          const denied = (e.outcome ?? 0) !== 0;
          return (
            <View style={[styles.entry, { borderColor: theme.border }]}>
              <View style={styles.row}>
                <Text style={[styles.what, { color: theme.text }]}>
                  {who(e, session.userId)} {ACTIONS[e.command ?? 0] ?? 'accessed your data'}
                </Text>
                {denied ? <Badge label="Refused" tone="high" /> : null}
              </View>
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {e.atMs ? new Date(e.atMs).toLocaleString() : ''}
                {e.detail ? ` · ${e.detail}` : ''}
              </Text>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.two },
  header: { gap: Spacing.three, marginBottom: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, marginBottom: Spacing.one },
  entry: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.two },
  what: { flex: 1, fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 13, lineHeight: 18 },
});
