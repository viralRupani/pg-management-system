import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';

import { Appbar } from '@/components/ui/appbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { invoiceStatus } from '@/components/ui/status';
import { api } from '@/lib/api';
import { qk, useInvoices } from '@/lib/queries';
import { InvoiceStatus, PaymentMethod } from '@pg/shared';
import {
  MAX_UPLOAD_LABEL,
  contentTypeOf,
  exceedsMaxSize,
  pickImage,
  uploadToPresignedPost,
  type PickedImage,
} from '@/lib/upload';
import { formatDate, formatPaise, toMessage } from '@/lib/utils';

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data } = useInvoices();
  const invoice = data?.find((i) => i.id === id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.UPI);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!invoice) {
    return (
      <Screen scroll={false}>
        <Appbar title="Invoice" />
        <Text className="px-4 text-ink2">Invoice not found.</Text>
      </Screen>
    );
  }

  const status = invoiceStatus(invoice.status);
  const payable =
    invoice.status === InvoiceStatus.PENDING ||
    invoice.status === InvoiceStatus.OVERDUE;

  async function choose(source: 'library' | 'camera') {
    const img = await pickImage(source);
    if (!img) return;
    if (exceedsMaxSize(img.size)) {
      Alert.alert('Image too large', `Please choose an image under ${MAX_UPLOAD_LABEL}.`);
      return;
    }
    setPicked(img);
  }

  const refTrimmed = reference.trim();
  const isCash = method === PaymentMethod.CASH;
  // Cash needs no proof; UPI needs at least one — a screenshot OR a reference
  // number (some apps block screenshots of the success screen).
  const canSubmit = isCash || Boolean(picked) || refTrimmed.length >= 6;

  function resetSheet() {
    setSheetOpen(false);
    setMethod(PaymentMethod.UPI);
    setPicked(null);
    setReference('');
  }

  async function submit() {
    if (!invoice || !canSubmit) return;
    setSubmitting(true);
    try {
      if (isCash) {
        await api.resident.payments.submit({
          invoiceId: invoice.id,
          method: PaymentMethod.CASH,
        });
      } else {
        let screenshotKey: string | undefined;
        if (picked) {
          const contentType = contentTypeOf(picked);
          const post = await api.resident.payments.uploadUrl({
            invoiceId: invoice.id,
            contentType,
          });
          const ok = await uploadToPresignedPost(post, picked.uri, contentType, picked.fileName);
          if (!ok) throw new Error('Upload failed. Please try a smaller image.');
          screenshotKey = post.key;
        }
        await api.resident.payments.submit({
          invoiceId: invoice.id,
          method: PaymentMethod.UPI,
          screenshotKey,
          referenceId: refTrimmed || undefined,
        });
      }
      await queryClient.invalidateQueries({ queryKey: qk.invoices });
      resetSheet();
      Alert.alert(
        'Submitted',
        isCash
          ? 'Your manager will confirm the cash payment and mark it paid.'
          : 'Your payment is awaiting manager approval.',
      );
    } catch (err) {
      Alert.alert('Could not submit', toMessage(err, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentClassName="gap-4">
      <Appbar title="Invoice" />

      <Card>
        <View className="flex-row items-center justify-between">
          <Text className="text-[15px] font-bold text-ink">
            {formatPeriod(invoice.period)}
          </Text>
          <Badge label={status.label} variant={status.variant} />
        </View>
        <View className="my-3 h-px bg-line2" />
        <View className="flex-row items-center justify-between">
          <Text className="text-[13px] text-ink2">Total payable</Text>
          <Text className="text-[22px] font-extrabold text-ink">
            {formatPaise(invoice.amountPaise)}
          </Text>
        </View>
        <Text className="mt-1 text-[13px] text-ink2">
          Due {formatDate(invoice.dueDate)}
        </Text>
      </Card>

      <Card className="bg-surface2">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
          How to pay
        </Text>
        <Text className="mt-1.5 text-[13px] leading-5 text-ink2">
          Pay the amount to your PG by UPI or in cash. For UPI, submit a
          screenshot or your reference number; for cash, just tap “Paid by cash”.
          Your manager reviews and approves it.
        </Text>
      </Card>

      {payable ? (
        <Button title="Submit payment" onPress={() => setSheetOpen(true)} />
      ) : null}

      <Sheet
        visible={sheetOpen}
        onClose={resetSheet}
        title="Submit payment"
        subtitle={`How did you pay ${formatPaise(invoice.amountPaise)}?`}
      >
        <View className="flex-row gap-3">
          <MethodOption
            icon="phone-portrait-outline"
            label="Pay by UPI"
            selected={method === PaymentMethod.UPI}
            onPress={() => setMethod(PaymentMethod.UPI)}
          />
          <MethodOption
            icon="cash-outline"
            label="Paid by cash"
            selected={isCash}
            onPress={() => setMethod(PaymentMethod.CASH)}
          />
        </View>

        {isCash ? (
          <View className="rounded-btn border border-line bg-surface2 p-3">
            <Text className="text-[13px] leading-5 text-ink2">
              You paid your manager in cash. Submit this so they can confirm
              receipt and mark the invoice paid. No screenshot needed.
            </Text>
          </View>
        ) : (
          // Grouped panel so the screenshot pickers + reference read as proof
          // belonging to the UPI choice above — not a peer set of boxes.
          <View className="gap-3 rounded-btn border border-line bg-surface2 p-3.5">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
              Add payment proof
            </Text>
            {picked ? (
              <View className="flex-row items-center gap-3 rounded-btn border border-line bg-surface p-3">
                <Image source={{ uri: picked.uri }} className="h-12 w-12 rounded-lg" />
                <Text className="flex-1 text-[13px] text-ink" numberOfLines={1}>
                  {picked.fileName}
                </Text>
                <Pressable onPress={() => setPicked(null)}>
                  <Ionicons name="close-circle" size={22} color="#9ca3af" />
                </Pressable>
              </View>
            ) : (
              <View className="gap-2">
                <Text className="text-[13px] text-ink2">
                  Upload a screenshot of your UPI payment.
                </Text>
                <View className="flex-row gap-3">
                  <PickButton icon="image-outline" label="Gallery" onPress={() => choose('library')} />
                  <PickButton icon="camera-outline" label="Camera" onPress={() => choose('camera')} />
                </View>
                <Text className="text-center text-[12px] text-ink3">
                  JPG, PNG or WebP · max {MAX_UPLOAD_LABEL}
                </Text>
              </View>
            )}

            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-line" />
              <Text className="text-[12px] font-medium text-ink3">OR enter reference</Text>
              <View className="h-px flex-1 bg-line" />
            </View>

            <Input
              label="UPI reference number"
              value={reference}
              onChangeText={setReference}
              placeholder="e.g. 4012 3456 7890"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text className="-mt-1 text-[12px] leading-4 text-ink3">
              Can&apos;t screenshot? GPay/PhonePe block it on some screens. Open the
              payment in your UPI app&apos;s history and copy the UPI transaction /
              reference ID (UTR).
            </Text>
          </View>
        )}

        <Button
          title={isCash ? 'Submit cash payment' : 'Submit for review'}
          onPress={submit}
          loading={submitting}
          disabled={!canSubmit}
        />
      </Sheet>
    </Screen>
  );
}

function PickButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center gap-2 rounded-btn border border-line bg-surface py-3.5 active:opacity-60"
    >
      <Ionicons name={icon} size={20} color="#0b7d73" />
      <Text className="text-[13px] font-semibold text-ink2">{label}</Text>
    </Pressable>
  );
}

function MethodOption({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center gap-2 rounded-btn border py-4 active:opacity-70 ${
        selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface'
      }`}
    >
      <Ionicons name={icon} size={24} color={selected ? '#0b7d73' : '#9ca3af'} />
      <Text
        className={`text-[13px] font-semibold ${selected ? 'text-brand' : 'text-ink3'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}
