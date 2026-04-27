import { calculateDistanceKm, calculateScore } from './gameMath'
import type { PartyMember } from './party'
import type { RoundTarget } from './roundTargets'

type GuessPosition = {
  lat: number
  lng: number
}

export type PartyRoundStanding = {
  userId: string
  displayName: string
  guessed: boolean
  distanceKm: number
  score: number
  placement: number
  isCurrentUser: boolean
  guessPosition: GuessPosition | null
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash
}

function seededUnit(seed: string) {
  return (hashString(seed) % 100000) / 100000
}

function offsetCoordinate(
  lat: number,
  lng: number,
  distanceKm: number,
  bearingDegrees: number,
) {
  const earthRadiusKm = 6371
  const distanceRatio = distanceKm / earthRadiusKm
  const bearing = (bearingDegrees * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180

  const nextLat = Math.asin(
    Math.sin(latRad) * Math.cos(distanceRatio) +
      Math.cos(latRad) * Math.sin(distanceRatio) * Math.cos(bearing),
  )

  const nextLng =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distanceRatio) * Math.cos(latRad),
      Math.cos(distanceRatio) - Math.sin(latRad) * Math.sin(nextLat),
    )

  return {
    lat: (nextLat * 180) / Math.PI,
    lng: ((nextLng * 180) / Math.PI + 540) % 360 - 180,
  }
}

function buildSimulatedStanding(
  member: PartyMember,
  target: RoundTarget,
  roundSeed: string,
) {
  const guessChance = seededUnit(`${roundSeed}:${member.userId}:guess`)

  if (guessChance < 0.14) {
    return {
      userId: member.userId,
      displayName: member.displayName,
      guessed: false,
      distanceKm: 0,
      score: 0,
      placement: 0,
      isCurrentUser: false,
      guessPosition: null,
    }
  }

  const distanceSeed = seededUnit(`${roundSeed}:${member.userId}:distance`)
  const bearingSeed = seededUnit(`${roundSeed}:${member.userId}:bearing`)
  const distanceKm = Math.round(Math.pow(distanceSeed, 1.9) * 12000 + 5)
  const bearingDegrees = Math.round(bearingSeed * 360)
  const guessPosition = offsetCoordinate(
    target.lat,
    target.lng,
    distanceKm,
    bearingDegrees,
  )

  return {
    userId: member.userId,
    displayName: member.displayName,
    guessed: true,
    distanceKm: Math.round(
      calculateDistanceKm(
        guessPosition.lat,
        guessPosition.lng,
        target.lat,
        target.lng,
      ),
    ),
    score: calculateScore(distanceKm),
    placement: 0,
    isCurrentUser: false,
    guessPosition,
  }
}

export function buildPartyRoundStandings(input: {
  partyCode: string
  currentRound: number
  target: RoundTarget
  members: PartyMember[]
  currentUserId: string | null
  currentGuess: GuessPosition | null
}) {
  const { currentGuess, currentRound, currentUserId, members, partyCode, target } = input
  const roundSeed = `${partyCode}:${currentRound}:${target.id}`

  const standings = members.map((member) => {
    if (member.userId === currentUserId) {
      const guessed = currentGuess !== null
      const distanceKm = guessed
        ? Math.round(
            calculateDistanceKm(
              currentGuess.lat,
              currentGuess.lng,
              target.lat,
              target.lng,
            ),
          )
        : 0

      return {
        userId: member.userId,
        displayName: member.displayName,
        guessed,
        distanceKm,
        score: guessed ? calculateScore(distanceKm) : 0,
        placement: 0,
        isCurrentUser: true,
        guessPosition: currentGuess,
      }
    }

    return buildSimulatedStanding(member, target, roundSeed)
  })

  standings.sort((left, right) => {
    if (left.guessed !== right.guessed) {
      return left.guessed ? -1 : 1
    }

    if (left.score !== right.score) {
      return right.score - left.score
    }

    if (left.distanceKm !== right.distanceKm) {
      return left.distanceKm - right.distanceKm
    }

    return left.displayName.localeCompare(right.displayName)
  })

  return standings.map((standing, index) => ({
    ...standing,
    placement: index + 1,
  }))
}
