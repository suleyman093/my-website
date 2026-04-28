import type { Party, PartyMember } from './party'
import { generateMatchId } from './auth'

export function toCurrentUserRoundResults(party: Party, userId: string | undefined) {
  return (party.activeMatch?.roundResults ?? []).map((round) => {
    const standing = round.standings.find((entry) => entry.userId === userId) ?? null

    return {
      roundNumber: round.roundNumber,
      targetName: round.targetName,
      distanceKm: standing?.distanceKm ?? 0,
      score: standing?.score ?? 0,
      guessed: standing?.guessed ?? false,
    }
  })
}

export function buildGameRouteStateFromParty(party: Party, userId: string | undefined) {
  const activeMatch = party.activeMatch
  if (!activeMatch) {
    return null
  }

  return {
    matchType: activeMatch.matchType,
    mode: activeMatch.mode,
    roundTime: activeMatch.roundTime,
    roundCount: activeMatch.roundCount,
    currentRound: activeMatch.currentRound,
    targetId: activeMatch.targetId,
    targetName: activeMatch.targetName,
    targetView: activeMatch.targetView,
    runningTotalScore: activeMatch.totalScores[userId ?? ''] ?? 0,
    usedTargetIds: activeMatch.usedTargetIds,
    roundResults: toCurrentUserRoundResults(party, userId),
    partyCode: party.code,
    partyMembers: party.members,
  }
}

export function buildResultRouteStateFromParty(party: Party, userId: string | undefined) {
  const activeMatch = party.activeMatch
  if (!activeMatch) {
    return null
  }

  const currentSubmission =
    activeMatch.submissions.find((entry) => entry.userId === userId) ?? null

  return {
    guess: currentSubmission?.guess ?? null,
    roundTime: activeMatch.roundTime,
    roundCount: activeMatch.roundCount,
    mode: activeMatch.mode,
    currentRound: activeMatch.currentRound,
    targetId: activeMatch.targetId,
    targetName: activeMatch.targetName,
    targetView: activeMatch.targetView,
    runningTotalScore: activeMatch.totalScores[userId ?? ''] ?? 0,
    usedTargetIds: activeMatch.usedTargetIds,
    roundResults: toCurrentUserRoundResults(party, userId),
    timedOut: Boolean(currentSubmission?.timedOut),
    partyCode: party.code,
    partyMembers: party.members as PartyMember[],
    matchType: activeMatch.matchType,
  }
}

export function buildFinalMatchStateFromParty(party: Party, userId: string | undefined) {
  const totalScores = party.activeMatch?.totalScores ?? {}
  const finalPlacements = party.members
    .map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      team: member.team,
      totalScore: totalScores[member.userId] ?? 0,
      isCurrentUser: member.userId === userId,
    }))
    .sort((left, right) => right.totalScore - left.totalScore)

  return {
    matchId: party.activeMatch?.matchId ?? generateMatchId(),
    totalScore: party.activeMatch?.totalScores[userId ?? ''] ?? 0,
    roundCount: party.activeMatch?.roundCount ?? party.settings.roundCount,
    roundTime: party.activeMatch?.roundTime ?? party.settings.roundTime,
    mode: party.activeMatch?.mode ?? party.settings.mode,
    matchType: party.activeMatch?.matchType ?? party.settings.matchType,
    roundResults: toCurrentUserRoundResults(party, userId),
    teamWinner: party.activeMatch?.winnerTeam ?? null,
    teamPoints: party.activeMatch?.teamPoints ?? null,
    partyCode: party.code,
    finalPlacements,
  }
}
