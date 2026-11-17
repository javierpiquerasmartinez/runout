import { useLayoutEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { RangeMatrix } from '../lab/RangeControls'
import { EMPTY_RANGE, HAND_CLASS_BY_NAME, HAND_CLASS_KINDS, HAND_CLASSES, withHandClass, type HandClass, type HandClassKind } from '../lab/range'

/*
 * The Cards branch's hole cards: the Lab's 13×13 matrix, picking Hand
 * Classes rather than painting a Range. A cell, or a stroke across a row or
 * a column, picks or takes out each Hand Class it crosses, as in the Lab;
 * the pairs, the suited and the offsuit are picked or taken out whole. It is
 * loaded only when the branch is opened, with the Lab's matrix and styles.
 */

/** The full brush: a picked Hand Class holds every one of its Combos. */
const PICKED = 100

export default function HandClassMatrix({
  values,
  onChange,
}: {
  /** The Hand Classes picked, as `AKs`. */
  values: readonly string[]
  /** The Hand Classes now picked, in the matrix's order. */
  onChange: (values: string[]) => void
}) {
  const { t } = useI18n()
  // A stroke picks several cells between two renders: each builds on the last.
  const latest = useRef(values)
  useLayoutEffect(() => {
    latest.current = values
  }, [values])

  const range = values.reduce((picked, name) => {
    const handClass = HAND_CLASS_BY_NAME.get(name)
    return handClass ? withHandClass(picked, handClass, PICKED) : picked
  }, EMPTY_RANGE)

  /** Changes the Hand Classes picked, from the latest, whatever has rendered since. */
  const put = (change: (picked: Set<string>) => void) => {
    const picked = new Set(latest.current)
    change(picked)
    const next = HAND_CLASSES.filter((handClass) => picked.has(handClass.name)).map((handClass) => handClass.name)
    latest.current = next
    onChange(next)
  }

  const paint = (handClass: HandClass, frequency: number) =>
    put((picked) => {
      if (frequency > 0) picked.add(handClass.name)
      else picked.delete(handClass.name)
    })

  const ofKind = (kind: HandClassKind) => HAND_CLASSES.filter((handClass) => handClass.kind === kind)
  const allPicked = (kind: HandClassKind) => ofKind(kind).every((handClass) => values.includes(handClass.name))

  return (
    <div className="more-filters__hand-classes">
      <RangeMatrix range={range} brush={PICKED} onPaint={paint} />
      <div className="more-filters__hand-class-kinds" role="group" aria-label={t('library.moreFilters.handClasses.kinds')}>
        {HAND_CLASS_KINDS.map((kind) => {
          const whole = allPicked(kind)
          return (
            <button
              key={kind}
              type="button"
              className="more-filters__option"
              aria-pressed={whole}
              onClick={() =>
                put((picked) => {
                  for (const handClass of ofKind(kind)) {
                    if (whole) picked.delete(handClass.name)
                    else picked.add(handClass.name)
                  }
                })
              }
            >
              <span>{t(`lab.stats.kind.${kind}`)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
