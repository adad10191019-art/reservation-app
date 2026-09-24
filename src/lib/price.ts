/**
 * お客様向け画面での金額表示。
 * 面談など無料メニューで「0円」と出すと、逆に費用がかかる印象を与えかねないため、
 * 0円のときは表示自体を省く（サロンなど有料メニューでは今まで通り表示する）。
 */
export function priceLabel(price: number): string | null {
  return price > 0 ? `${price.toLocaleString()}円` : null;
}
