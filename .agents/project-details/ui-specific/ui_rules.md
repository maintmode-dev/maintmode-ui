# UI Rules — Maintenance Calendar

## RULE-01 Visibility
События и их ключевой текст должны быть видимы без hover.

## RULE-02 Minimum size
Событие должно оставаться читаемым в day/week/month. Если места мало — корректный truncate с ellipsis.

## RULE-03 Conflict indicator
Конфликт должен иметь явный визуальный индикатор (иконка/stripe/badge), видимый до клика.

## RULE-04 Planned vs Actual
Плановое и фактическое время должны различаться визуально, а не только текстом.

## RULE-05 Overlap readability
Нельзя допускать наложение текста событий друг на друга.

## RULE-06 Overflow behavior
В month view переполнение контента должно обрабатываться аккуратно (`+N more`/ellipsis).

## RULE-07 Semantic colors
Один смысл = один цвет. Нельзя смешивать значения статусов в одинаковой цветовой семантике.

## RULE-08 Empty/error/loading states
Состояния `loading`, `error`, `empty` обязаны быть явными и понятными.

## RULE-09 Interaction affordance
Интерактивные элементы должны выглядеть интерактивными (курсор, hover, фокус).

## RULE-10 Fail-first
Если невозможно уверенно подтвердить соответствие правилу — фиксировать FAIL.

## RULE-11 Month packing priority
Для month view действует обязательный контракт `.agents/project-details/ui-specific/calendar_month_packing.md`:
- приоритет размещения: `spanning` перед `timed-single-day`;
- `+N more` только в нижней строке ячейки;
- timed-событие обязано показывать время начала.
