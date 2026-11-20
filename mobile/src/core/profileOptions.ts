export const profileHelp = [
  { question: 'Where can I track an order or request a return?', answer: 'For a Shopify purchase, use the confirmation email from the store to track delivery or contact the merchant about a return. Demo orders are available in your local order history.' },
  { question: 'How do I change my delivery address or payment method?', answer: 'Choose the basket for the store you want to buy from. Enter your address and payment details at that store’s checkout. Each merchant sets delivery fees and payment options. Contact the store to change an order you have already placed.' },
  { question: 'Who can access my try-on photo?', answer: 'Your saved photo belongs to your signed-in account. You can replace it from your account. When you confirm a generation, Fashion Centre sends the photo and selected garment to Pruna to create the result.' },
  { question: 'Which information stays on this device?', answer: 'Your bag, demo orders, followed stores, browsing history and shopping preferences are kept on this device. You can export shopping records as a backup. Your account name and saved try-on photo are managed separately.' },
  { question: 'About Fashion Centre', answer: 'Fashion Centre brings independent stores into one marketplace. Explore their collections, try on pieces with a photo, and check out separately with each merchant.' },
] as const;

export async function saveProfileName(request: (path: string, options: RequestInit) => Promise<Response>, accountId: string, value: string) {
  const firstName = value.trim();
  if (!firstName || firstName.length > 80) throw new Error('Enter a name between 1 and 80 characters.');
  const response = await request('/api/auth/me', {method: 'POST', credentials: 'include',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({accountId, firstName})});
  if (!response.ok) throw new Error(response.status === 401 || response.status === 409 ? 'Your account changed. Reopen Profile to continue.' : 'Could not save your name. Try again.');
  return firstName;
}
