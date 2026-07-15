/**
 * Curated set display names. RiftScribe's filters endpoint only returns set
 * codes, so names live here — add a line when a new set releases (the sync
 * job warns about codes it can't name). If the API ever starts returning
 * real names, those win over this map.
 */
export const SET_NAMES: Record<string, string> = {
  OGN: 'Origins',
  SFD: 'Spiritforged',
  UNL: 'Unleashed',
  // Starter-deck exclusives; official name per TCGplayer's group listing.
  OGS: 'Origins: Proving Grounds',
  // Announced 5th set; name confirmed by TCGplayer's group listing (2026-07).
  VEN: 'Vendetta',
};
