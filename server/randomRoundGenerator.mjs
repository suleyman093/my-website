import { randomUUID } from 'node:crypto'
import { roundCatalog } from './roundCatalog.mjs'

const streetViewRegions = [
  { code: 'us-west', name: 'Western United States', latMin: 32.2, latMax: 47.8, lngMin: -124.6, lngMax: -111.0 },
  { code: 'us-central', name: 'Central United States', latMin: 29.8, latMax: 46.8, lngMin: -104.5, lngMax: -88.5 },
  { code: 'canada-south', name: 'Southern Canada', latMin: 43.0, latMax: 53.8, lngMin: -123.8, lngMax: -73.0 },
  { code: 'mexico', name: 'Mexico', latMin: 16.5, latMax: 31.5, lngMin: -117.2, lngMax: -86.5 },
  { code: 'brazil-south', name: 'Southern Brazil', latMin: -31.5, latMax: -14.0, lngMin: -57.5, lngMax: -43.0 },
  { code: 'argentina', name: 'Argentina', latMin: -39.5, latMax: -24.0, lngMin: -68.8, lngMax: -57.0 },
  { code: 'chile', name: 'Chile', latMin: -40.5, latMax: -28.0, lngMin: -73.5, lngMax: -70.0 },
  { code: 'peru', name: 'Peru', latMin: -17.5, latMax: -8.0, lngMin: -78.8, lngMax: -71.0 },
  { code: 'colombia', name: 'Colombia', latMin: 2.0, latMax: 9.5, lngMin: -76.8, lngMax: -73.0 },
  { code: 'spain', name: 'Spain', latMin: 37.0, latMax: 43.5, lngMin: -8.5, lngMax: 2.8 },
  { code: 'france', name: 'France', latMin: 43.0, latMax: 49.2, lngMin: -1.8, lngMax: 6.8 },
  { code: 'germany', name: 'Germany', latMin: 47.5, latMax: 53.8, lngMin: 7.0, lngMax: 13.8 },
  { code: 'italy', name: 'Italy', latMin: 38.0, latMax: 45.7, lngMin: 8.0, lngMax: 16.8 },
  { code: 'poland', name: 'Poland', latMin: 49.2, latMax: 54.4, lngMin: 14.2, lngMax: 23.8 },
  { code: 'romania', name: 'Romania', latMin: 44.0, latMax: 47.9, lngMin: 21.0, lngMax: 28.3 },
  { code: 'greece', name: 'Greece', latMin: 37.2, latMax: 41.0, lngMin: 21.5, lngMax: 26.8 },
  { code: 'turkey', name: 'Turkiye', latMin: 37.0, latMax: 41.8, lngMin: 27.0, lngMax: 35.8 },
  { code: 'morocco', name: 'Morocco', latMin: 30.2, latMax: 35.5, lngMin: -9.8, lngMax: -1.2 },
  { code: 'south-africa', name: 'South Africa', latMin: -34.3, latMax: -25.0, lngMin: 18.0, lngMax: 31.0 },
  { code: 'kenya', name: 'Kenya', latMin: -1.6, latMax: 1.9, lngMin: 35.0, lngMax: 39.4 },
  { code: 'uganda', name: 'Uganda', latMin: -0.3, latMax: 1.6, lngMin: 31.7, lngMax: 34.5 },
  { code: 'ghana', name: 'Ghana', latMin: 5.2, latMax: 7.9, lngMin: -2.8, lngMax: 0.2 },
  { code: 'senegal', name: 'Senegal', latMin: 13.0, latMax: 16.3, lngMin: -17.8, lngMax: -13.0 },
  { code: 'japan', name: 'Japan', latMin: 34.1, latMax: 43.5, lngMin: 130.5, lngMax: 141.8 },
  { code: 'south-korea', name: 'South Korea', latMin: 34.7, latMax: 37.9, lngMin: 126.0, lngMax: 129.5 },
  { code: 'taiwan', name: 'Taiwan', latMin: 22.6, latMax: 25.2, lngMin: 120.0, lngMax: 121.9 },
  { code: 'thailand', name: 'Thailand', latMin: 13.0, latMax: 19.8, lngMin: 98.0, lngMax: 101.8 },
  { code: 'philippines', name: 'Philippines', latMin: 10.0, latMax: 17.6, lngMin: 120.0, lngMax: 124.8 },
  { code: 'indonesia', name: 'Indonesia', latMin: -8.8, latMax: -6.0, lngMin: 106.0, lngMax: 112.5 },
  { code: 'malaysia', name: 'Malaysia', latMin: 2.3, latMax: 6.2, lngMin: 100.0, lngMax: 103.8 },
  { code: 'vietnam', name: 'Vietnam', latMin: 10.2, latMax: 21.5, lngMin: 105.0, lngMax: 109.8 },
  { code: 'india-north', name: 'Northern India', latMin: 26.5, latMax: 32.5, lngMin: 74.5, lngMax: 81.5 },
  { code: 'india-south', name: 'Southern India', latMin: 11.0, latMax: 19.5, lngMin: 72.5, lngMax: 79.8 },
  { code: 'sri-lanka', name: 'Sri Lanka', latMin: 6.5, latMax: 7.9, lngMin: 79.8, lngMax: 81.1 },
  { code: 'australia-east', name: 'Eastern Australia', latMin: -37.8, latMax: -16.8, lngMin: 145.0, lngMax: 153.5 },
  { code: 'new-zealand', name: 'New Zealand', latMin: -43.8, latMax: -36.2, lngMin: 172.0, lngMax: 176.8 },
]

const regionGroups = {
  americas: ['us-west', 'us-central', 'canada-south', 'mexico', 'brazil-south', 'argentina', 'chile', 'peru', 'colombia'],
  europe: ['spain', 'france', 'germany', 'italy', 'poland', 'romania', 'greece'],
  'africa-middle-east': ['turkey', 'morocco', 'south-africa', 'kenya', 'uganda', 'ghana', 'senegal'],
  'asia-pacific': ['japan', 'south-korea', 'taiwan', 'thailand', 'philippines', 'indonesia', 'malaysia', 'vietnam'],
  'oceania-south-asia': ['india-north', 'india-south', 'sri-lanka', 'australia-east', 'new-zealand'],
}

const metadataRadiusMeters = 50000
const strictMinimumDistanceKm = 1600
const relaxedMinimumDistanceKm = 900
const attemptsPerRound = 24

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function normalizeLongitude(lng) {
  if (lng > 180) {
    return lng - 360
  }

  if (lng < -180) {
    return lng + 360
  }

  return lng
}

function shuffle(array) {
  const copy = [...array]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function toRadians(value) {
  return (value * Math.PI) / 180
}

function distanceKmBetween(left, right) {
  const earthRadiusKm = 6371
  const deltaLat = toRadians(right.lat - left.lat)
  const deltaLng = toRadians(right.lng - left.lng)

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(left.lat)) *
      Math.cos(toRadians(right.lat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

function buildHeading(seed) {
  return Array.from(seed).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360
}

function createCatalogTarget(target) {
  return {
    id: target.id,
    name: target.name,
    lat: target.lat,
    lng: target.lng,
    heading: buildHeading(target.id),
    pitch: 8,
    panoId: null,
    source: 'catalog',
  }
}

function buildFallbackPlan(roundCount, excludedTargetIds = []) {
  const excluded = new Set(excludedTargetIds)
  const availableTargets = roundCatalog.filter((target) => !excluded.has(target.id))
  const source = availableTargets.length > 0 ? availableTargets : roundCatalog
  const shuffled = shuffle(source)
  const plan = []

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const target = shuffled[roundIndex % shuffled.length]
    plan.push(createCatalogTarget(target))
    excluded.add(target.id)
  }

  return plan
}

function sampleRegionCoordinate(region) {
  return {
    lat: Number(randomBetween(region.latMin, region.latMax).toFixed(6)),
    lng: Number(normalizeLongitude(randomBetween(region.lngMin, region.lngMax)).toFixed(6)),
  }
}

function buildRegionQueue(regionCounts, previousTarget) {
  const previousRegionCode = previousTarget?.regionCode ?? null
  return shuffle(streetViewRegions).sort((left, right) => {
    const leftCount = regionCounts.get(left.code) ?? 0
    const rightCount = regionCounts.get(right.code) ?? 0

    if (leftCount !== rightCount) {
      return leftCount - rightCount
    }

    if (previousRegionCode) {
      if (left.code === previousRegionCode && right.code !== previousRegionCode) {
        return 1
      }

      if (right.code === previousRegionCode && left.code !== previousRegionCode) {
        return -1
      }
    }

    return 0
  })
}

async function fetchStreetViewMetadata(candidate, apiKey) {
  const metadataUrl = new URL('https://maps.googleapis.com/maps/api/streetview/metadata')
  metadataUrl.searchParams.set('location', `${candidate.lat},${candidate.lng}`)
  metadataUrl.searchParams.set('radius', String(metadataRadiusMeters))
  metadataUrl.searchParams.set('source', 'outdoor')
  metadataUrl.searchParams.set('key', apiKey)

  const response = await fetch(metadataUrl, {
    signal: AbortSignal.timeout(7000),
  })

  if (!response.ok) {
    throw new Error(`Street View metadata request failed with ${response.status}.`)
  }

  return response.json()
}

function buildRandomTarget(region, metadata, fallbackCoordinate) {
  const panoId = String(metadata.pano_id ?? randomUUID())
  const location = metadata.location ?? {}
  const lat = Number(location.lat ?? fallbackCoordinate.lat)
  const lng = Number(location.lng ?? fallbackCoordinate.lng)
  const regionName = region.name

  return {
    id: `sv-${region.code}-${panoId.slice(0, 12)}`,
    name: regionName,
    lat,
    lng,
    heading: buildHeading(panoId),
    pitch: 8,
    panoId,
    regionCode: region.code,
    group: Object.entries(regionGroups).find(([, regionCodes]) => regionCodes.includes(region.code))?.[0] ?? 'global',
    source: 'streetview',
  }
}

async function pickValidatedTarget({
  apiKey,
  excludedTargetIds,
  previousTarget,
  regionCounts,
  minimumDistanceKm,
}) {
  const regionQueue = buildRegionQueue(regionCounts, previousTarget)
  const excluded = new Set(excludedTargetIds)

  for (let attempt = 0; attempt < attemptsPerRound; attempt += 1) {
    const region = regionQueue[attempt % regionQueue.length]
    const candidate = sampleRegionCoordinate(region)

    try {
      const metadata = await fetchStreetViewMetadata(candidate, apiKey)
      if (metadata.status !== 'OK') {
        continue
      }

      const nextTarget = buildRandomTarget(region, metadata, candidate)
      if (excluded.has(nextTarget.id)) {
        continue
      }

      if (previousTarget && minimumDistanceKm > 0) {
        const distanceKm = distanceKmBetween(previousTarget, nextTarget)
        if (distanceKm < minimumDistanceKm) {
          continue
        }
      }

      return nextTarget
    } catch {
      continue
    }
  }

  return null
}

export async function buildServerRoundPlan({
  roundCount,
  excludedTargetIds = [],
  apiKey,
}) {
  const plan = []
  const regionCounts = new Map()
  const usedTargetIds = new Set(excludedTargetIds)
  let previousTarget = null

  if (!apiKey) {
    return buildFallbackPlan(roundCount, excludedTargetIds)
  }

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    let nextTarget =
      (await pickValidatedTarget({
        apiKey,
        excludedTargetIds: usedTargetIds,
        previousTarget,
        regionCounts,
        minimumDistanceKm: previousTarget ? strictMinimumDistanceKm : 0,
      })) ??
      (await pickValidatedTarget({
        apiKey,
        excludedTargetIds: usedTargetIds,
        previousTarget,
        regionCounts,
        minimumDistanceKm: previousTarget ? relaxedMinimumDistanceKm : 0,
      }))

    if (!nextTarget) {
      const fallbackPlan = buildFallbackPlan(1, [...usedTargetIds])
      nextTarget = fallbackPlan[0]
    }

    plan.push(nextTarget)
    usedTargetIds.add(nextTarget.id)

    if (nextTarget.regionCode) {
      regionCounts.set(nextTarget.regionCode, (regionCounts.get(nextTarget.regionCode) ?? 0) + 1)
    }

    previousTarget = nextTarget
  }

  return plan
}
