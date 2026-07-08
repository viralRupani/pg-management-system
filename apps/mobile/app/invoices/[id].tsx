import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, View } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { Appbar } from '@/components/ui/appbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { invoiceBadge, paymentStatus } from '@/components/ui/status';
import { AppText } from '@/components/ui/text';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import {
  qk,
  useInvoiceCharges,
  useInvoicePayments,
  useInvoices,
  usePaymentInfo,
} from '@/lib/queries';
import { InvoiceStatus, PaymentMethod, PaymentStatus, type ResidentPayment } from '@pg/shared';
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
  const tokens = useTokens();
  const { data } = useInvoices();
  const invoice = data?.find((i) => i.id === id);

  const { data: paymentInfo } = usePaymentInfo();
  const { data: charges } = useInvoiceCharges(id);
  const { data: payments } = useInvoicePayments(id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.UPI);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  // QR is collapsed by default — most residents just copy the UPI ID; the QR is
  // a fallback and its 192px image is what made the drawer tall.
  const [showQr, setShowQr] = useState(false);

  async function getCachedQr(): Promise<string> {
    const dest = FileSystem.cacheDirectory + 'upi-qr.png';
    await FileSystem.downloadAsync(paymentInfo!.upiQrUrl!, dest);
    return dest;
  }

  async function saveQrToGallery() {
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission required',
          'Please allow access to Photos so the QR code can be saved to your gallery.',
        );
        return;
      }
      const dest = await getCachedQr();
      await MediaLibrary.saveToLibraryAsync(dest);
      Alert.alert(
        'Saved to gallery',
        'Open your UPI app → Pay via QR → pick from gallery to pay.',
      );
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function copyUpiId() {
    if (!paymentInfo?.upiId) return;
    await Clipboard.setStringAsync(paymentInfo.upiId);
    toast.success('UPI ID copied.');
  }

  async function shareQrCode() {
    setSharing(true);
    try {
      const dest = await getCachedQr();
      await Sharing.shareAsync(dest, {
        mimeType: 'image/png',
        dialogTitle: 'Share UPI QR code',
      });
    } catch {
      Alert.alert('Could not share QR', 'Please try again.');
    } finally {
      setSharing(false);
    }
  }

  if (!invoice) {
    return (
      <Screen scroll={false}>
        <Appbar title="Invoice" />
        <AppText variant="body" className="px-4 text-ink2">
          Invoice not found.
        </AppText>
      </Screen>
    );
  }

  const deleted = Boolean(invoice.deletedAt);
  const underReview = invoice.underReview && !deleted;
  const status = invoiceBadge(invoice.status, underReview);
  // A payment already awaiting review blocks re-submitting until the manager
  // decides — if they reject it, `underReview` drops and the invoice is payable
  // again with no state change of its own.
  const payable =
    !deleted &&
    !underReview &&
    (invoice.status === InvoiceStatus.PENDING ||
      invoice.status === InvoiceStatus.OVERDUE);

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
    setShowQr(false);
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
      await queryClient.invalidateQueries({ queryKey: qk.invoicePayments(invoice.id) });
      // Close the sheet BEFORE toasting — the Modal sits above the root tree.
      resetSheet();
      toast.success(
        isCash
          ? 'Submitted — your manager will confirm the cash payment.'
          : 'Payment submitted for review.',
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

      {/* Amount hero */}
      <Card>
        <View className="flex-row items-center justify-between">
          <AppText variant="caption" className="uppercase tracking-wider">
            {formatPeriod(invoice.period)} · Rent
          </AppText>
          {deleted ? (
            <Badge label="Cancelled" variant="neutral" />
          ) : (
            <Badge label={status.label} variant={status.variant} />
          )}
        </View>
        <AppText variant="display" className="mt-2 text-[34px] leading-[40px]">
          {formatPaise(invoice.amountPaise)}
        </AppText>
        <AppText variant="sub" className="mt-0.5">
          Due {formatDate(invoice.dueDate)}
        </AppText>

        {charges && charges.length > 0 ? (
          <>
            <View className="my-3 h-px bg-line2" />
            <View className="gap-1.5">
              {/* "Rent & adjustments" is the remainder — it also covers proration
                  and any transfer/carry-forward corrections. */}
              <View className="flex-row items-center justify-between">
                <AppText variant="sub">Rent &amp; adjustments</AppText>
                <AppText variant="sub" className="text-ink">
                  {formatPaise(
                    invoice.amountPaise -
                      charges.reduce((s, c) => s + c.amountPaise, 0),
                  )}
                </AppText>
              </View>
              {charges.map((c) => (
                <View key={c.id} className="flex-row items-center justify-between">
                  <AppText variant="sub">{c.label}</AppText>
                  <AppText variant="sub" className="text-ink">
                    {formatPaise(c.amountPaise)}
                  </AppText>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </Card>

      {/* Payment(s) the resident submitted for this invoice — mode (UPI/cash),
          the UPI reference, and the proof screenshot. Newest first, so the
          current attempt leads and any earlier rejected try sits below it. */}
      {payments && payments.length > 0
        ? payments.map((p, i) => (
            <PaymentCard key={p.id} payment={p} first={i === 0} />
          ))
        : null}

      {deleted ? (
        <Card className="bg-surface2">
          <AppText variant="caption" className="uppercase tracking-wider">
            Invoice cancelled
          </AppText>
          <AppText variant="sub" className="mt-1.5 leading-5">
            Your manager cancelled this invoice
            {invoice.deletedReason ? `: ${invoice.deletedReason}` : '.'} Nothing
            is owed — no payment is needed.
          </AppText>
        </Card>
      ) : underReview ? (
        <Card className="flex-row items-start gap-3 bg-surface2">
          <Ionicons name="hourglass-outline" size={20} color={tokens.info} />
          <View className="flex-1">
            <AppText variant="caption" className="uppercase tracking-wider">
              Payment under review
            </AppText>
            <AppText variant="sub" className="mt-1.5 leading-5">
              You&apos;ve submitted a payment for this invoice. Your manager is
              confirming it — once approved it&apos;ll show as paid. If it&apos;s
              rejected, you can submit again here.
            </AppText>
          </View>
        </Card>
      ) : payable ? (
        <Card className="bg-surface2">
          <AppText variant="caption" className="uppercase tracking-wider">
            How to pay
          </AppText>
          <AppText variant="sub" className="mt-1.5 leading-5">
            Pay the amount to your PG by UPI or in cash. For UPI, submit a
            screenshot or your reference number; for cash, just tap “Paid by cash”.
            Your manager reviews and approves it.
          </AppText>
        </Card>
      ) : null}

      {payable ? (
        <Button title="Submit payment" onPress={() => setSheetOpen(true)} />
      ) : null}

      <Sheet
        visible={sheetOpen}
        animated={true}
        onClose={resetSheet}
        title="Submit payment"
        subtitle={`How did you pay ${formatPaise(invoice.amountPaise)}?`}
      >
        <Segmented<PaymentMethod>
          options={[
            { label: 'Pay by UPI', value: PaymentMethod.UPI },
            { label: 'Paid by cash', value: PaymentMethod.CASH },
          ]}
          value={method}
          onChange={setMethod}
        />

        {/* Where to send the money — only relevant when paying by UPI. Compact
            by default: a copiable UPI ID row with the QR tucked behind a toggle. */}
        {!isCash && (paymentInfo?.upiId || paymentInfo?.upiQrUrl) ? (
          <View className="gap-2.5 rounded-tile border border-line bg-surface2 p-4">
            <AppText variant="caption" className="uppercase tracking-wider">
              Pay to
            </AppText>

            {paymentInfo?.upiId ? (
              <PressableScale
                onPress={copyUpiId}
                accessibilityRole="button"
                accessibilityLabel={`Copy UPI ID ${paymentInfo.upiId}`}
                className="flex-row items-center gap-3 rounded-tile border border-line bg-surface p-3"
              >
                <View className="flex-1">
                  <AppText variant="body" className="text-ink" numberOfLines={1}>
                    {paymentInfo.upiId}
                  </AppText>
                  <AppText variant="caption" className="text-ink3">
                    Tap to copy
                  </AppText>
                </View>
                <Ionicons name="copy-outline" size={20} color={tokens.brandDeep} />
              </PressableScale>
            ) : null}

            {paymentInfo?.upiQrUrl ? (
              showQr ? (
                <View className="items-center gap-2.5 pt-0.5">
                  <Image
                    source={{ uri: paymentInfo.upiQrUrl }}
                    className="h-44 w-44 rounded-lg"
                    resizeMode="contain"
                  />
                  <View className="w-full flex-row gap-2">
                    <QrAction
                      icon="download-outline"
                      label={saving ? 'Opening…' : 'Save'}
                      disabled={saving || sharing}
                      onPress={saveQrToGallery}
                    />
                    <QrAction
                      icon="share-outline"
                      label={sharing ? 'Opening…' : 'Share'}
                      disabled={saving || sharing}
                      onPress={shareQrCode}
                    />
                  </View>
                </View>
              ) : (
                <PressableScale
                  onPress={() => setShowQr(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Show QR code"
                  className="flex-row items-center justify-center gap-2 rounded-btn border border-line bg-surface py-2.5"
                >
                  <Ionicons name="qr-code-outline" size={16} color={tokens.brandDeep} />
                  <AppText variant="label" className="text-brand-deep">
                    Show QR code
                  </AppText>
                </PressableScale>
              )
            ) : null}
          </View>
        ) : null}

        {isCash ? (
          <View className="rounded-tile border border-line bg-surface2 p-3">
            <AppText variant="sub" className="leading-5">
              You paid your manager in cash. Submit this so they can confirm
              receipt and mark the invoice paid. No screenshot needed.
            </AppText>
          </View>
        ) : (
          // Grouped panel so the screenshot pickers + reference read as proof
          // belonging to the UPI choice above — not a peer set of boxes.
          <View className="gap-3 rounded-tile border border-line bg-surface2 p-3.5">
            <AppText variant="caption" className="uppercase tracking-wider">
              Add payment proof
            </AppText>
            {picked ? (
              <View className="flex-row items-center gap-3 rounded-tile border border-line bg-surface p-3">
                <Image source={{ uri: picked.uri }} className="h-12 w-12 rounded-lg" />
                <AppText variant="sub" className="flex-1 text-ink" numberOfLines={1}>
                  {picked.fileName}
                </AppText>
                <PressableScale
                  onPress={() => setPicked(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove screenshot"
                  className="h-9 w-9 items-center justify-center"
                >
                  <Ionicons name="close-circle" size={22} color={tokens.ink3} />
                </PressableScale>
              </View>
            ) : (
              <View className="gap-2">
                <AppText variant="sub">Upload a screenshot of your UPI payment.</AppText>
                <View className="flex-row gap-3">
                  <PickButton icon="image-outline" label="Gallery" onPress={() => choose('library')} />
                  <PickButton icon="camera-outline" label="Camera" onPress={() => choose('camera')} />
                </View>
                <AppText variant="caption" className="text-center text-[12px]">
                  JPG, PNG or WebP · max {MAX_UPLOAD_LABEL}
                </AppText>
              </View>
            )}

            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-line" />
              <AppText variant="caption" className="text-[12px]">
                OR enter reference
              </AppText>
              <View className="h-px flex-1 bg-line" />
            </View>

            <Input
              label="UPI reference number"
              value={reference}
              onChangeText={setReference}
              placeholder="e.g. 4012 3456 7890"
              autoCapitalize="characters"
              autoCorrect={false}
              hint="Can't screenshot? Copy the UPI transaction / reference ID (UTR) from your UPI app's payment history."
            />
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

function PaymentCard({
  payment,
  first,
}: {
  payment: ResidentPayment;
  first: boolean;
}) {
  const badge = paymentStatus(payment.status);
  const isCash = payment.method === PaymentMethod.CASH;
  const isRejected = payment.status === PaymentStatus.REJECTED;

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <AppText variant="caption" className="uppercase tracking-wider">
          {first ? 'Your payment' : 'Earlier attempt'}
        </AppText>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      <View className="mt-3 gap-2.5">
        <DetailRow
          icon={isCash ? 'cash-outline' : 'phone-portrait-outline'}
          label="Paid by"
          value={isCash ? 'Cash' : 'UPI'}
        />
        <DetailRow
          icon="wallet-outline"
          label="Amount"
          value={formatPaise(payment.amountPaise)}
        />
        {payment.referenceId ? (
          <DetailRow
            icon="receipt-outline"
            label="UPI reference"
            value={payment.referenceId}
          />
        ) : null}
        <DetailRow
          icon="time-outline"
          label="Submitted"
          value={formatDate(payment.createdAt)}
        />
      </View>

      {isRejected && payment.reviewNote ? (
        <View className="mt-3 rounded-tile border border-line bg-surface2 p-3">
          <AppText variant="caption" className="uppercase tracking-wider">
            Reason
          </AppText>
          <AppText variant="sub" className="mt-1 leading-5">
            {payment.reviewNote}
          </AppText>
        </View>
      ) : null}

      {payment.screenshotUrl ? (
        <View className="mt-3 gap-1.5">
          <AppText variant="caption" className="uppercase tracking-wider">
            Payment proof
          </AppText>
          <Image
            source={{ uri: payment.screenshotUrl }}
            className="h-64 w-full rounded-tile bg-surface2"
            resizeMode="contain"
          />
        </View>
      ) : null}
    </Card>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const tokens = useTokens();
  return (
    <View className="flex-row items-center gap-3">
      <Ionicons name={icon} size={16} color={tokens.ink3} />
      <AppText variant="sub" className="flex-1">
        {label}
      </AppText>
      <AppText variant="sub" className="text-ink">
        {value}
      </AppText>
    </View>
  );
}

function QrAction({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const tokens = useTokens();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-btn border border-line bg-surface py-2.5 ${disabled ? 'opacity-40' : ''}`}
    >
      <Ionicons name={icon} size={16} color={tokens.brandDeep} />
      <AppText variant="label" className="text-brand-deep">
        {label}
      </AppText>
    </PressableScale>
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
  const tokens = useTokens();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-btn border border-line bg-surface py-3"
    >
      <Ionicons name={icon} size={20} color={tokens.brandDeep} />
      <AppText variant="label" className="text-ink2">
        {label}
      </AppText>
    </PressableScale>
  );
}

function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}
