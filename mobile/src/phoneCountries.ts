export const phoneCountries = [
  { iso: "AU", name: "Australia", dial: "+61", digits: 9 },
  { iso: "CA", name: "Canada", dial: "+1", digits: 10 },
  { iso: "IN", name: "India", dial: "+91", digits: 10 },
  { iso: "GB", name: "United Kingdom", dial: "+44", digits: 10 },
  { iso: "US", name: "United States", dial: "+1", digits: 10 },
] as const;

export type PhoneCountry = (typeof phoneCountries)[number];
export const defaultCountry = phoneCountries[0];

export function matchingCountries(search: string) {
  const query = search.trim().toLowerCase();
  return phoneCountries.filter(country =>
    [country.name, country.dial, country.iso, country.iso === "GB" ? "UK" : ""]
      .some(value => value.toLowerCase().includes(query)));
}

export function normalisePhone(dial: string, input: string) {
  const country = phoneCountries.find(item => item.dial === dial);
  const number = input.trim();
  if (!country || !/^\+?[\d\s()-]+$/.test(number))
    throw new Error("Enter a valid national number for the selected country code.");
  let digits = number.replace(/\D/g, "");
  if (number.startsWith("+") || number.startsWith("00")) {
    if (number.startsWith("00")) digits = digits.slice(2);
    if (!digits.startsWith(dial.slice(1)))
      throw new Error("The phone number does not match the selected country code.");
    digits = digits.slice(dial.length - 1);
  }
  if (dial !== "+1") digits = digits.replace(/^0/, "");
  if (digits.length !== country.digits) throw new Error("Enter a valid national number for the selected country code.");
  return dial + digits;
}
