/**
 * Curated set display names. RiftScribe's filters endpoint only returns set
 * codes, so names live here — add a line when a new set releases (the sync
 * job warns about codes it can't name). If the API ever starts returning
 * real names, those win over this map.
 */
export const SET_NAMES: Record<string, string> = {
  OGN: 'Origins',
  UNL: 'Unleashed',
  // OGS: '…',  // TODO confirm on riftscribe.gg
  // SFD: '…',  // TODO confirm on riftscribe.gg
};
