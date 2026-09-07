// Авто-аналитика по клиенту: превращает цифры Instagram и рекламы в выводы.
//
// Это правила, а не модель. Каждый вывод можно проверить руками, он не
// придумывает фактов и молчит, когда данных не хватает, — в отчёте клиенту
// такую фразу можно повторить, не перепроверяя.
//
// Функции чистые: на вход — уже загруженные данные, на выход — список выводов.
// Поэтому один и тот же движок работает и на мобильной карточке, и на десктопе.

import { today, parseYmd } from './tz'

/* ──────────────────────────── Вспомогательное ──────────────────────────── */

const num = n => Math.round(n || 0).toLocaleString('ru-RU')
const money = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('ru-RU')

function plural(n, one, few, many) {
  const m10 = Math.abs(n) % 10
  const m100 = Math.abs(n) % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const daysBetween = (aIso, bIso) =>
  Math.round((parseYmd(bIso) - parseYmd(aIso)) / 86400000)

// Те же типы действий, что во вкладке «Таргет». Копия сознательная: трогать
// рабочий экран ради общего модуля рискованнее, чем продублировать список.
const MESSAGING_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
]

export function adMetrics(stats) {
  if (!stats) return null
  const pick = (arr, types) => {
    if (!Array.isArray(arr)) return 0
    return arr
      .filter(a => types.includes(a.action_type))
      .reduce((s, a) => Math.max(s, parseFloat(a.value) || 0), 0)
  }
  const spend = parseFloat(stats.spend) || 0
  const messaging = pick(stats.actions, MESSAGING_TYPES)
  return {
    spend,
    reach: parseInt(stats.reach) || 0,
    clicks: parseInt(stats.clicks) || 0,
    ctr: parseFloat(stats.ctr) || 0,
    messaging,
    costPerMessage: messaging > 0 ? spend / messaging : null,
  }
}

const TYPE_NAME = {
  IMAGE: ['фото', 'фото'],
  VIDEO: ['reels', 'reels'],
  CAROUSEL_ALBUM: ['карусель', 'карусели'],
}
const typeName = (t, plural2) => (TYPE_NAME[t] ? TYPE_NAME[t][plural2 ? 1 : 0] : 'посты')

/* ────────────────────────────── Сами правила ───────────────────────────── */

/**
 * @param analytics ответ api/instagram action=analytics
 * @param snapshots замеры подписчиков по дням, от старых к свежим
 * @param ads       метрики рекламы за тот же период (adMetrics) или null
 * @param client    строка клиента: total_posts и т.д.
 * @param days      длина периода в днях
 * @returns [{ id, tone: 'good'|'warn'|'bad'|'info', text }]
 */
export function buildInsights({ analytics, snapshots = [], ads = null, client = null, days = 30 }) {
  const out = []
  if (!analytics) return out

  const followers = analytics.profile?.followers || 0
  const posts = analytics.posts || {}
  const reach = analytics.insights?.reach || null

  /* Регулярность — первым делом: это то, на что можно повлиять сегодня. */

  if (posts.lastPost) {
    const idle = daysBetween(posts.lastPost, today())
    if (idle >= 4) {
      out.push({
        id: 'idle',
        tone: idle >= 7 ? 'bad' : 'warn',
        text: `Последняя публикация ${idle} ${plural(idle, 'день', 'дня', 'дней')} назад. ` +
          `Охват падает уже на четвёртый день без постов — это самая дешёвая вещь, которую можно поправить.`,
      })
    }
  }

  const plan = client?.total_posts || 0
  if (plan > 0 && days >= 28 && posts.count != null) {
    const diff = posts.count - plan
    if (diff < 0) {
      out.push({
        id: 'plan',
        tone: diff <= -3 ? 'bad' : 'warn',
        text: `За ${days} дней вышло ${posts.count} ${plural(posts.count, 'пост', 'поста', 'постов')} ` +
          `при плане ${plan}. Не хватает ${-diff}.`,
      })
    } else if (diff >= 0) {
      out.push({
        id: 'plan',
        tone: 'good',
        text: `План выполняется: ${posts.count} ${plural(posts.count, 'пост', 'поста', 'постов')} ` +
          `за ${days} дней при плане ${plan}.`,
      })
    }
  }

  /* Подписчики */

  if (snapshots.length >= 2) {
    const first = snapshots[0]
    const last = snapshots[snapshots.length - 1]
    const span = Math.max(daysBetween(first.taken_on, last.taken_on), 1)
    const delta = (last.followers || 0) - (first.followers || 0)
    const perDay = delta / span

    let text = delta === 0
      ? `Подписчиков столько же, сколько ${span} ${plural(span, 'день', 'дня', 'дней')} назад — ${num(followers)}.`
      : `${delta > 0 ? '+' : ''}${num(delta)} ${plural(delta, 'подписчик', 'подписчика', 'подписчиков')} ` +
        `за ${span} ${plural(span, 'день', 'дня', 'дней')} — это ${Math.round(perDay * 10) / 10} в день.`

    // Цену подписчика считаем, только если окно замеров сопоставимо с рекламным
    // периодом. Иначе делили бы месячные траты на трёхдневный прирост.
    if (ads?.spend > 0 && delta > 0 && span >= days - 2) {
      text += ` Реклама за это время стоила ${money(ads.spend)} — по ${money(ads.spend / delta)} за подписчика. ` +
        `Это грубая оценка: часть людей приходит и без рекламы.`
    }

    out.push({ id: 'growth', tone: delta > 0 ? 'good' : delta === 0 ? 'info' : 'warn', text })
  } else if (followers) {
    out.push({
      id: 'growth',
      tone: 'info',
      text: `${num(followers)} ${plural(followers, 'подписчик', 'подписчика', 'подписчиков')}. ` +
        `Meta не хранит историю, поэтому рост посчитается, когда накопится хотя бы два замера — ` +
        `по одному за каждый день, когда открывали статистику.`,
    })
  }

  /* Вовлечённость */

  if (followers > 0 && posts.count > 0) {
    const perPost = (posts.likes + posts.comments) / posts.count
    const er = (perPost / followers) * 100
    const tone = er >= 3 ? 'good' : er >= 1 ? 'info' : 'warn'
    out.push({
      id: 'er',
      tone,
      text: `Вовлечённость ${er.toFixed(1)}% — в среднем ${num(posts.avgLikes)} ` +
        `${plural(posts.avgLikes, 'лайк', 'лайка', 'лайков')} и ${posts.avgComments} ` +
        `${plural(Math.round(posts.avgComments), 'комментарий', 'комментария', 'комментариев')} на пост ` +
        `при ${num(followers)} подписчиках. ` +
        (tone === 'good' ? 'Это выше обычного для аккаунта такого размера.'
          : tone === 'info' ? 'Нормой считают 1–3%.'
          : 'Ниже 1% — аудитория почти не реагирует, стоит менять темы или подачу.'),
    })
  }

  /* Форматы */

  const types = Object.entries(posts.byType || {}).filter(([, b]) => b.count >= 2)
  if (types.length >= 2) {
    const sorted = [...types].sort((a, b) => b[1].avgEngagement - a[1].avgEngagement)
    const [bestKey, best] = sorted[0]
    const [worstKey, worst] = sorted[sorted.length - 1]
    if (worst.avgEngagement > 0 && best.avgEngagement >= worst.avgEngagement * 1.4) {
      const share = Math.round((best.count / posts.count) * 100)
      out.push({
        id: 'format',
        tone: share < 40 ? 'warn' : 'good',
        text: `Лучше всего заходят ${typeName(bestKey, true)}: ${num(best.avgEngagement)} реакций на пост ` +
          `против ${num(worst.avgEngagement)} у ${typeName(worstKey, true)}. ` +
          (share < 40
            ? `При этом их всего ${best.count} из ${posts.count} — есть смысл сместить план в эту сторону.`
            : `Их уже ${share}% плана — направление верное.`),
      })
    }
  }

  /* Охват */

  if (reach?.series?.length >= 6) {
    const s = reach.series
    const half = Math.floor(s.length / 2)
    const a = s.slice(0, half).reduce((x, v) => x + v.value, 0)
    const b = s.slice(half).reduce((x, v) => x + v.value, 0)
    if (a > 0) {
      const pct = Math.round(((b - a) / a) * 100)
      if (Math.abs(pct) >= 15) {
        out.push({
          id: 'reachTrend',
          tone: pct > 0 ? 'good' : 'warn',
          text: `Охват ${pct > 0 ? 'растёт' : 'падает'}: ${num(b)} во второй половине периода ` +
            `против ${num(a)} в первой, ${pct > 0 ? '+' : ''}${pct}%.`,
        })
      }
    }
  }

  if (reach?.total > 0 && followers > 0 && days > 0) {
    const perDay = reach.total / days
    out.push({
      id: 'reachDepth',
      tone: 'info',
      text: `В среднем ${num(perDay)} ${plural(Math.round(perDay), 'человек', 'человека', 'человек')} в день ` +
        `видят аккаунт — ${Math.round((perDay / followers) * 100)}% от числа подписчиков. ` +
        `Один и тот же человек в разные дни считается заново.`,
    })
  }

  /* Реклама */

  if (ads && ads.spend > 0) {
    if (ads.messaging > 0) {
      out.push({
        id: 'ads',
        tone: 'info',
        text: `Реклама: ${money(ads.spend)} за ${days} дней → ${num(ads.messaging)} ` +
          `${plural(ads.messaging, 'переписка', 'переписки', 'переписок')}, ` +
          `по ${money(ads.costPerMessage)} за каждую.`,
      })
    } else {
      out.push({
        id: 'ads',
        tone: 'bad',
        text: `Потрачено ${money(ads.spend)}, а переписок за период нет. ` +
          `Стоит проверить, ведёт ли кампания в директ и настроена ли цель на сообщения.`,
      })
    }

    if (ads.reach > 0 && reach?.total > 0) {
      const share = Math.round((ads.reach / (ads.reach + reach.total)) * 100)
      out.push({
        id: 'paidShare',
        tone: share >= 80 ? 'warn' : 'info',
        text: `${share}% охвата даёт реклама, ${100 - share}% — органика. ` +
          (share >= 80 ? 'Как только реклама встанет, аккаунт почти замолчит.' : ''),
      })
    }
  }

  return out
}
