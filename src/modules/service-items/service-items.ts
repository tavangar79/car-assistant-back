export interface ServiceItem {
  id: string;
  title: string;
  subtitle: string;
  /** Material Symbols icon name. */
  icon: string;
}

export interface ServiceCategory {
  id: string;
  title: string;
  items: ServiceItem[];
}

/** Lookups over the static service-items catalog. Item ids are unique across categories. */
export class ServiceItemCatalog {
  private readonly items = new Map<string, ServiceItem>();
  private readonly categoryIds = new Map<string, string>();

  constructor(private readonly categories: ServiceCategory[]) {
    for (const category of categories) {
      for (const item of category.items) {
        this.items.set(item.id, item);
        this.categoryIds.set(item.id, category.id);
      }
    }
  }

  list(): { categories: ServiceCategory[] } {
    return { categories: this.categories };
  }

  has(itemId: string): boolean {
    return this.items.has(itemId);
  }

  get(itemId: string): ServiceItem | undefined {
    return this.items.get(itemId);
  }

  /** The id of the category the item belongs to, e.g. `fluids`. */
  categoryOf(itemId: string): string | undefined {
    return this.categoryIds.get(itemId);
  }
}
