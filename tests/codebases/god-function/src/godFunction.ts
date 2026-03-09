type EventInput = {
  userId: string;
  country: string;
  amount: number;
  items: Array<{ sku: string; qty: number }>;
  coupon?: string;
};

export function runOrderPipeline(input: EventInput): string {
  const normalizedCountry = input.country.trim().toUpperCase();
  const subtotal = input.items.reduce((acc, item) => acc + item.qty * 10, 0);
  const hasCoupon = Boolean(input.coupon && input.coupon.length > 0);
  let discount = 0;

  if (hasCoupon) {
    if (input.coupon === 'VIP') {
      discount = subtotal * 0.2;
    } else if (input.coupon === 'WELCOME') {
      discount = subtotal * 0.1;
    } else if (input.coupon === 'FLASH') {
      discount = subtotal * 0.15;
    } else {
      discount = 0;
    }
  }

  const taxedAmount = subtotal - discount;
  let taxRate = 0.08;
  if (normalizedCountry === 'US') {
    taxRate = 0.07;
  } else if (normalizedCountry === 'CA') {
    taxRate = 0.13;
  } else if (normalizedCountry === 'DE') {
    taxRate = 0.19;
  } else if (normalizedCountry === 'FR') {
    taxRate = 0.2;
  } else if (normalizedCountry === 'JP') {
    taxRate = 0.1;
  }

  const total = taxedAmount + taxedAmount * taxRate;
  const isLargeOrder = total > 500;
  const fraudScore = input.amount > 1000 ? 0.9 : input.amount > 500 ? 0.6 : 0.1;
  const needsReview = isLargeOrder || fraudScore > 0.7;

  if (needsReview) {
    return `review:${input.userId}:${total.toFixed(2)}`;
  }

  if (total < 50) {
    return `low:${input.userId}:${total.toFixed(2)}`;
  }

  if (total < 250) {
    return `normal:${input.userId}:${total.toFixed(2)}`;
  }

  return `priority:${input.userId}:${total.toFixed(2)}`;
}
