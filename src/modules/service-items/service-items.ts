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

  constructor(private readonly categories: ServiceCategory[]) {
    for (const category of categories) {
      for (const item of category.items) this.items.set(item.id, item);
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
}
