export function processCheckout(
  hasCart: boolean,
  hasPayment: boolean,
  hasShipping: boolean,
  hasDiscount: boolean,
): string {
  if (hasCart) {
    if (hasPayment) {
      if (hasShipping) {
        if (hasDiscount) {
          return 'ready-with-discount';
        }
        return 'ready';
      }
      return 'missing-shipping';
    }
    return 'missing-payment';
  }

  return 'missing-cart';
}
