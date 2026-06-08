import { GenericOrderNormalizer } from "./GenericOrderNormalizer.js";

export class FlatCommerceOrderNormalizer extends GenericOrderNormalizer {
  supports(channelCd: string): boolean {
    return ["11ST", "GODO"].includes(channelCd);
  }
}
