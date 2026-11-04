/** Exchange rates: what one unit of `from` is worth in `to` on a date (`YYYY-MM-DD`). Swappable; the web app uses the ECB via Frankfurter. */
export interface RateProvider {
  getRate(from: string, to: string, date: string): Promise<number>;
}
