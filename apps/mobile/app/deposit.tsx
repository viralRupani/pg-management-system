import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { Appbar } from '@/components/ui/appbar';
import { Button } from '@/components/ui/button';
import { CalendarSheet } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Sheet } from '@/components/ui/sheet';
import { AppText } from '@/components/ui/text';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { qk, useDeposit } from '@/lib/queries';
import { DepositTxnType } from '@pg/shared';
import { cn, formatDate, formatPaise, toMessage, ymd } from '@/lib/utils';

function plusDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export default function DepositScreen() {
  const queryClient = useQueryClient();
  const tokens = useTokens();
  const { data, isLoading, isError, isFetching, refetch } = useDeposit();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [date, setDate] = useState<Date>(() => plusDays(30));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.resident.deposits.requestExit({ requestedDate: ymd(date), note: note.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: qk.deposit });
      // Close the sheet BEFORE toasting — the Modal sits above the root tree.
      setSheetOpen(false);
      setNote('');
      toast.success('Move-out request sent — your manager will review it.');
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
      ) : isError ? (
        <ErrorState title="Couldn't load your deposit" onRetry={() => refetch()} />
      ) : !data?.deposit ? (
        <EmptyState
          icon="shield-outline"
          title="No deposit recorded"
          description="Once your manager records your security deposit, it will show here."
        />
      ) : (
        <>
          <Card className="items-center bg-brand">
            <AppText variant="caption" className="uppercase tracking-wider text-brand-foreground-dim">
              Deposit held
            </AppText>
            <AppText variant="display" className="mt-1 text-[38px] leading-[44px] text-brand-foreground">
              {formatPaise(data.availablePaise)}
            </AppText>
            <AppText variant="sub" className="text-brand-foreground-dim">
              Refunded on exit, less any deductions
            </AppText>
          </Card>

          {data.ledger.length ? (
            <Card>
              <AppText variant="caption" className="uppercase tracking-wider">
                Ledger
              </AppText>
              <View className="mt-3">
                {data.ledger.map((t, i) => {
                  const collection = t.type === DepositTxnType.COLLECTION;
                  const refund = t.type === DepositTxnType.REFUND;
                  const last = i === data.ledger.length - 1;
                  const label = collection ? 'Collected' : refund ? 'Refund' : 'Deduction';
                  return (
                    <View key={t.id} className="flex-row gap-3">
                      {/* Timeline rail: dot + connector */}
                      <View className="items-center">
                        <View
                          className={cn(
                            'mt-1 h-3 w-3 rounded-full border-2',
                            collection
                              ? 'border-info-dot bg-info-bg'
                              : refund
                                ? 'border-success-dot bg-success-bg'
                                : 'border-danger-dot bg-danger-bg',
                          )}
                        />
                        {!last ? <View className="w-px flex-1 bg-line" /> : null}
                      </View>
                      <View className={cn('flex-1 flex-row items-start justify-between', !last && 'pb-4')}>
                        <View className="flex-1 pr-2">
                          <AppText variant="body" weight="semibold" className="text-[14px]">
                            {label}
                          </AppText>
                          <AppText variant="sub" className="text-[12px]">
                            {t.reason ?? '—'} · {formatDate(t.createdAt)}
                          </AppText>
                        </View>
                        <AppText
                          variant="body"
                          weight="bold"
                          className={collection ? 'text-info' : refund ? 'text-success' : 'text-danger'}
                        >
                          {refund || collection ? '' : '−'}
                          {formatPaise(t.amountPaise)}
                        </AppText>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {data.exitRequest ? (
            <Card className="flex-row items-center gap-3 border-amber-line bg-amber-bg">
              <Ionicons name="time-outline" size={20} color={tokens.amber} />
              <AppText variant="sub" weight="medium" className="flex-1 text-amber">
                Move-out requested for {formatDate(data.exitRequest.requestedDate)} — awaiting manager.
              </AppText>
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
        animated={true}
        subtitle="Most PGs require 30 days' notice. Pick your preferred date."
      >
        <View className="gap-2">
          <AppText variant="label" className="text-ink2">
            Move-out date
          </AppText>
          <PressableScale
            onPress={() => setCalendarOpen(true)}
            pressedScale={0.99}
            accessibilityRole="button"
            accessibilityLabel={`Move-out date, ${formatDate(ymd(date))}`}
            className="flex-row items-center justify-between rounded-field border-[1.5px] border-line bg-surface px-3.5 py-3"
          >
            <AppText variant="body" weight="semibold" className="text-[16px]">
              {formatDate(ymd(date))}
            </AppText>
            <Ionicons name="calendar-outline" size={20} color={tokens.brandDeep} />
          </PressableScale>
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

      {/* Stacked above the move-out sheet (mounted later → renders on top). */}
      <CalendarSheet
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onSelect={setDate}
        value={date}
        minDate={plusDays(1)}
        title="Move-out date"
        subtitle="Earliest is tomorrow."
        confirmLabel="Set date"
      />
    </Screen>
  );
}
