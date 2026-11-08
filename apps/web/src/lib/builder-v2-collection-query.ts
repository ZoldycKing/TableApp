import type {BuilderV2DataRequest} from './builder-v2-data-types'
import {builderCalendarDay,builderCalendarMonth} from './builder-v2-calendar'

/** Transport validation only; fields and column keys are resolved from the canonical node on the server. */
export function validBuilderCollectionQuery(value:Pick<BuilderV2DataRequest,'calendarMonth'|'calendarDay'|'boardColumn'>){
  return (value.calendarMonth===undefined||typeof value.calendarMonth==='string'&&(value.calendarMonth==='undated'||builderCalendarMonth(value.calendarMonth)))&&
    (value.calendarDay===undefined||typeof value.calendarDay==='string'&&builderCalendarDay(value.calendarDay))&&
    (value.boardColumn===undefined||typeof value.boardColumn==='string'&&value.boardColumn.length<=200)&&
    !(value.boardColumn!==undefined&&(value.calendarMonth!==undefined||value.calendarDay!==undefined))&&
    (value.calendarDay===undefined||value.calendarMonth!==undefined&&value.calendarDay.startsWith(value.calendarMonth+'-'))
}
