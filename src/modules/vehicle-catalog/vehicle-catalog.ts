export interface CatalogRef {
  id: string;
  name: string;
}

export interface CatalogModel extends CatalogRef {
  trims: CatalogRef[];
}

export interface CatalogMake extends CatalogRef {
  models: CatalogModel[];
}

/** A make/model/trim choice as ids. */
export interface CatalogSelection {
  makeId: string;
  modelId: string;
  trimId: string | null;
}

/** The same choice with display names. */
export interface ResolvedSelection {
  make: CatalogRef;
  model: CatalogRef;
  trim: CatalogRef | null;
}

/** Validation messages keyed by field (`makeId`, `modelId`, `trimId`); empty when valid. */
export type CatalogErrors = Partial<Record<keyof CatalogSelection, string[]>>;

const ref = ({ id, name }: CatalogRef): CatalogRef => ({ id, name });

/** Lookups over the static catalog. Model and trim ids are unique across the catalog. */
export class VehicleCatalog {
  private readonly makes = new Map<string, CatalogMake>();
  private readonly models = new Map<string, CatalogModel & { makeId: string }>();
  private readonly trims = new Map<string, CatalogRef & { modelId: string }>();

  constructor(private readonly catalog: CatalogMake[]) {
    for (const make of catalog) {
      this.makes.set(make.id, make);
      for (const model of make.models) {
        this.models.set(model.id, { ...model, makeId: make.id });
        for (const trim of model.trims) this.trims.set(trim.id, { ...trim, modelId: model.id });
      }
    }
  }

  list(): { makes: CatalogMake[] } {
    return { makes: this.catalog };
  }

  /** Every id must exist, the model must belong to the make and the trim to the model. */
  check({ makeId, modelId, trimId }: CatalogSelection): CatalogErrors {
    const errors: CatalogErrors = {};
    const make = this.makes.get(makeId);
    const model = this.models.get(modelId);
    if (!make) errors.makeId = ['Unknown make'];
    if (!model) errors.modelId = ['Unknown model'];
    else if (make && model.makeId !== make.id)
      errors.modelId = ['Model does not belong to the make'];

    if (trimId !== null) {
      const trim = this.trims.get(trimId);
      if (!trim) errors.trimId = ['Unknown trim'];
      else if (model && trim.modelId !== model.id)
        errors.trimId = ['Trim does not belong to the model'];
    }
    return errors;
  }

  /**
   * For a partial choice (a service-catalog scope, where null means "any"): `modelId` needs `makeId`,
   * `trimId` needs `modelId`, and each given id must exist under its parent. Empty when valid.
   */
  checkScope({
    makeId,
    modelId,
    trimId,
  }: {
    makeId: string | null;
    modelId: string | null;
    trimId: string | null;
  }): string[] {
    if (modelId !== null && makeId === null) return ['modelId requires makeId'];
    if (trimId !== null && modelId === null) return ['trimId requires modelId'];
    if (makeId !== null && !this.makes.has(makeId)) return ['Unknown make'];
    if (modelId !== null) {
      const model = this.models.get(modelId);
      if (!model) return ['Unknown model'];
      if (model.makeId !== makeId) return ['Model does not belong to the make'];
    }
    if (trimId !== null) {
      const trim = this.trims.get(trimId);
      if (!trim) return ['Unknown trim'];
      if (trim.modelId !== modelId) return ['Trim does not belong to the model'];
    }
    return [];
  }

  /** Display names for stored ids. An id no longer in the catalog falls back to the id itself. */
  resolve({ makeId, modelId, trimId }: CatalogSelection): ResolvedSelection {
    const name = (found: CatalogRef | undefined, id: string) =>
      found ? ref(found) : { id, name: id };
    return {
      make: name(this.makes.get(makeId), makeId),
      model: name(this.models.get(modelId), modelId),
      trim: trimId === null ? null : name(this.trims.get(trimId), trimId),
    };
  }
}
