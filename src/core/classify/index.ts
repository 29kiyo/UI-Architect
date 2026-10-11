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
export { getClassifyHook, mergeClassification, setClassifyHook } from './hook'
export type { AiClassification, ClassifyContext, ClassifyHook, MergedClassification } from './hook'
export {
  arrangeLayout,
  estimateLayout,
  fixOverflow,
  layoutPropsOf,
  rectOf,
  revertLayout,
} from './layout'
export type { ArrangeLayoutResult, LayoutEstimate, Rect } from './layout'
export { arrangeNodes } from './arrange'
export type { ArrangeOptions, ArrangeResult } from './arrange'
export {
  createMobileCommand,
  createMobileCommandFor,
  planMobile,
  planMobileAsync,
  setMobileAssistHook,
} from './mobile'
export type { MobileAssistHook, MobileOp, MobilePlanOptions } from './mobile'
