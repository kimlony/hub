import { CoupangOrderNormalizer } from "./CoupangOrderNormalizer.js";
import { FlatCommerceOrderNormalizer } from "./FlatCommerceOrderNormalizer.js";
import { GenericOrderNormalizer } from "./GenericOrderNormalizer.js";
import { GiftOrderNormalizer } from "./GiftOrderNormalizer.js";
import { SmartstoreOrderNormalizer } from "./SmartstoreOrderNormalizer.js";
import { WchanOrderNormalizer } from "./WchanOrderNormalizer.js";
import { OnryOrderNormalizer } from "./OnryOrderNormalizer.js";
import type { OrderNormalizer } from "./types.js";

export class NormalizerRegistry {
  // Keep specific normalizers before the generic fallback. This lets a new
  // channel override shared flat-commerce behavior without changing callers.
  private readonly normalizers: OrderNormalizer[] = [
    new SmartstoreOrderNormalizer(),
    new CoupangOrderNormalizer(),
    new GiftOrderNormalizer(),
    new WchanOrderNormalizer(),
    new OnryOrderNormalizer(),
    new FlatCommerceOrderNormalizer(),
    new GenericOrderNormalizer()
  ];

  get(channelCd: string): OrderNormalizer {
    const normalizer = this.normalizers.find((candidate) => candidate.supports(channelCd));
    if (!normalizer) {
      throw new Error(`Unsupported normalizer channelCd: ${channelCd}`);
    }
    return normalizer;
  }
}
