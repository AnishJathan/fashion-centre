export function preparationReady(input: {
  photo: boolean;
  garment: boolean;
  rights: boolean;
  understood: boolean;
}): boolean {
  return input.photo && input.garment && input.rights && input.understood;
}
