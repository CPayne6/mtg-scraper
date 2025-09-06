
export type Condition = 'nm' | 'pl' | 'mp' | 'hp' | 'unknown'

export interface Card {
  price: number;
  condition: Condition;
  image: string;
  title: string;
  currency: string;
  link: string;
}
