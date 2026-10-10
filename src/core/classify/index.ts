export {
  categoryRegistry,
  getCategory,
  isKnownCategory,
  listCategories,
  registerCategory,
} from './categories'
export type { CategoryDef } from './categories'
export { extractFeatures } from './features'
export type { ClassifyFeatures } from './features'
export { registerRule, ruleRegistry } from './rules'
export type { ClassifyRule } from './rules'
export { classifyNode, classifyNodes, createSetCategoryCommand } from './engine'
export type { Classification, ClassifyOptions } from './engine'
