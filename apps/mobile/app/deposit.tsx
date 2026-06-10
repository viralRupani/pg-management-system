import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';

import { Appbar } from '@/components/ui/appbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { qk, useDeposit } from '@/lib/queries';
import { DepositTxnType } from '@pg/shared';
import { formatDate, formatPaise, toMessage, ymd } from '@/lib/utils';

function plusDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export default function DepositScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useDeposit();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [date, setDate] = useState<Date>(() => plusDays(30));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const shift = (days: number) =>
    setDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + days);
      const min = plusDays(1);
      return next < min ? min : next;
    });

  async function submit() {
    setBusy(true);
    try {
      await api.resident.deposits.requestExit({ requestedDate: ymd(date), note: note.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: qk.deposit });
      setSheetOpen(false);
      setNote('');
      Alert.alert('Request sent', 'Your manager will review your move-out request.');
    } catch (err) {
      Alert.alert('Could not send', toMessage(err, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      contentClassName="gap-4"
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
    >
      <Appbar title="Security deposit" />

      {isLoading ? (
        <ListSkeleton />
      ) : !data?.deposit ? (
        <EmptyState
          icon="shield-outline"
          title="No deposit recorded"
          description="Once your manager records your security deposit, it will show here."
        />
      ) : (
        <>
          <Card className="items-center bg-brand">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-brand-foreground/80">
              Deposit held
            </Text>
            <Text className="mt-1 text-[38px] font-extrabold text-brand-foreground">
              {formatPaise(data.deposit.amountPaise)}
            </Text>
            <Text className="text-[13px] text-brand-foreground/80">
              Refunded on exit, less any deductions
            </Text>
          </Card>

          {data.ledger.length ? (
            <Card>
              <Text className="text-[13px] font-bold uppercase tracking-wider text-ink3">
                Ledger
              </Text>
              <View className="mt-2">
                {data.ledger.map((t, i) => {
                  const refund = t.type === DepositTxnType.REFUND;
                  return (
                    <View
                      key={t.id}
                      className={`flex-row items-center justify-between py-2.5 ${i > 0 ? 'border-t border-line2' : ''}`}
                    >
                      <View className="flex-1">
                        <Text className="text-[14px] font-semibold text-ink">
                          {refund ? 'Refund' : 'Deduction'}
                        </Text>
                        <Text className="text-[12px] text-ink2">
                          {t.reason ?? '—'} · {formatDate(t.createdAt)}
                        </Text>
                      </View>
                      <Text
                        className={`text-[15px] font-bold ${refund ? 'text-success' : 'text-danger'}`}
                      >
                        {refund ? '+' : '−'}
                        {formatPaise(t.amountPaise)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {data.exitRequest ? (
            <Card className="flex-row items-center gap-3 bg-amber-bg">
              <Ionicons name="time-outline" size={20} color="#b45309" />
              <Text className="flex-1 text-[13px] font-medium text-amber">
                Move-out requested for {formatDate(data.exitRequest.requestedDate)} — awaiting manager.
              </Text>
            </Card>
          ) : (
            <Button title="Request move-out" variant="ghost" onPress={() => setSheetOpen(true)} />
          )}
        </>
      )}

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Request move-out"
        subtitle="Most PGs require 30 days' notice. Pick your preferred date."
      >
        <View className="gap-2">
          <Text className="text-[13px] font-semibold text-ink2">Move-out date</Text>
          <View className="flex-row items-center justify-between rounded-btn border border-line px-3 py-2">
            <Pressable onPress={() => shift(-1)} className="p-2 active:opacity-60">
              <Ionicons name="remove-circle-outline" size={24} color="#6b7280" />
            </Pressable>
            <Text className="text-[16px] font-bold text-ink">{formatDate(ymd(date))}</Text>
            <Pressable onPress={() => shift(1)} className="p-2 active:opacity-60">
              <Ionicons name="add-circle-outline" size={24} color="#6b7280" />
            </Pressable>
          </View>
        </View>
        <Input
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Anything your manager should know…"
          multiline
        />
        <Button title="Send request" onPress={submit} loading={busy} />
      </Sheet>
    </Screen>
  );
}
