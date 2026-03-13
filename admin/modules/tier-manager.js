import { LEAGUE_FORMATS, POINTS } from '../../shared/constants.js';

export class TierManager {
  /**
   * Distribute players across tiers based on their rank order.
   * Players should be in the desired ranked order (index 0 = best).
   * @param {Object} leagueData
   * @param {Array} rankedPlayerIds - Player IDs in ranked order (best first)
   * @returns {Object} Updated leagueData with tier/tierRank assigned
   */
  static distributePlayers(leagueData, rankedPlayerIds) {
    const { tierConfig } = leagueData.league;
    const { tiers, playersPerTier } = tierConfig;

    const players = leagueData.players.map(player => {
      const rankIndex = rankedPlayerIds.indexOf(player.id);
      if (rankIndex === -1 || !player.active) {
        return { ...player, tier: null, tierRank: null };
      }
      const tierIndex = Math.floor(rankIndex / playersPerTier);
      const tierName = tiers[tierIndex] || null;
      const tierRank = (rankIndex % playersPerTier) + 1;
      return { ...player, tier: tierName, tierRank };
    });

    return { ...leagueData, players };
  }

  /**
   * Get players in a specific tier, sorted by tierRank.
   */
  static getTierPlayers(leagueData, tierName) {
    return leagueData.players
      .filter(p => p.active && p.tier === tierName)
      .sort((a, b) => (a.tierRank || 0) - (b.tierRank || 0));
  }

  /**
   * Get all tiers with their players.
   * @returns {Object} { tierName: [players...], ... }
   */
  static getAllTierPlayers(leagueData) {
    const { tiers } = leagueData.league.tierConfig;
    const result = {};
    for (const tier of tiers) {
      result[tier] = this.getTierPlayers(leagueData, tier);
    }
    return result;
  }

  /**
   * Sort players by tier standings (simpler than Swiss - no Buchholz/SOS).
   * Order: points desc > frame diff desc > frames won desc > name asc
   */
  static sortByTierStandings(players) {
    return [...players].sort((a, b) => {
      if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
      if (b.stats.frameDifference !== a.stats.frameDifference) return b.stats.frameDifference - a.stats.frameDifference;
      if (b.stats.framesWon !== a.stats.framesWon) return b.stats.framesWon - a.stats.framesWon;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get sorted standings for a specific tier.
   */
  static getTierStandings(leagueData, tierName) {
    const tierPlayers = this.getTierPlayers(leagueData, tierName);
    return this.sortByTierStandings(tierPlayers);
  }

  /**
   * Get standings for all tiers.
   * @returns {Object} { tierName: [sortedPlayers...], ... }
   */
  static getAllTierStandings(leagueData) {
    const { tiers } = leagueData.league.tierConfig;
    const result = {};
    for (const tier of tiers) {
      result[tier] = this.getTierStandings(leagueData, tier);
    }
    return result;
  }

  /**
   * Calculate which players would be promoted/relegated based on current standings.
   * @returns {Object} { promotions: [{player, fromTier, toTier}], relegations: [{player, fromTier, toTier}] }
   */
  static calculatePromotionRelegation(leagueData) {
    const { tiers, promotionCount } = leagueData.league.tierConfig;
    const standings = this.getAllTierStandings(leagueData);
    const promotions = [];
    const relegations = [];

    for (let i = 0; i < tiers.length; i++) {
      const tierName = tiers[i];
      const tierStandings = standings[tierName];

      if (!tierStandings || tierStandings.length === 0) continue;

      // Top N of each tier (except first tier) get promoted
      if (i > 0) {
        const promoted = tierStandings.slice(0, promotionCount);
        for (const player of promoted) {
          promotions.push({
            player,
            fromTier: tierName,
            toTier: tiers[i - 1]
          });
        }
      }

      // Bottom N of each tier (except last tier) get relegated
      if (i < tiers.length - 1) {
        const relegated = tierStandings.slice(-promotionCount);
        for (const player of relegated) {
          relegations.push({
            player,
            fromTier: tierName,
            toTier: tiers[i + 1]
          });
        }
      }
    }

    return { promotions, relegations };
  }

  /**
   * Check if a new season can be started (all rounds complete).
   */
  static canStartNewSeason(leagueData) {
    const errors = [];
    const { league, rounds } = leagueData;

    if (rounds.length === 0) {
      errors.push('No rounds have been played yet');
    }

    if (rounds.length < league.totalRounds) {
      errors.push(`Only ${rounds.length} of ${league.totalRounds} rounds completed`);
    }

    const incompleteRounds = rounds.filter(r => r.status !== 'completed');
    if (incompleteRounds.length > 0) {
      errors.push(`${incompleteRounds.length} round(s) still incomplete`);
    }

    return { canStart: errors.length === 0, errors };
  }

  /**
   * Apply promotion/relegation and start a new season.
   * - Snapshots current standings as finalStandings on the current season
   * - Swaps promoted/relegated players between tiers
   * - Resets season stats (preserves careerStats)
   * - Creates a new season entry
   * - Resets rounds and currentRound
   */
  static applyPromotionRelegation(leagueData) {
    const { promotions, relegations } = this.calculatePromotionRelegation(leagueData);
    const { tiers } = leagueData.league.tierConfig;

    // Snapshot final standings for current season
    const finalStandings = this.getAllTierStandings(leagueData);
    const finalStandingsSnapshot = {};
    for (const tier of tiers) {
      finalStandingsSnapshot[tier] = (finalStandings[tier] || []).map(p => ({
        id: p.id,
        name: p.name,
        stats: { ...p.stats }
      }));
    }

    // Complete current season
    const currentSeasonIdx = leagueData.seasons.findIndex(
      s => s.seasonNumber === leagueData.league.currentSeason
    );
    const updatedSeasons = [...leagueData.seasons];
    if (currentSeasonIdx >= 0) {
      updatedSeasons[currentSeasonIdx] = {
        ...updatedSeasons[currentSeasonIdx],
        status: 'completed',
        completedAt: new Date().toISOString(),
        promotions: promotions.map(p => ({ playerId: p.player.id, fromTier: p.fromTier, toTier: p.toTier })),
        relegations: relegations.map(r => ({ playerId: r.player.id, fromTier: r.fromTier, toTier: r.toTier })),
        finalStandings: finalStandingsSnapshot
      };
    }

    // Build new tier assignments by swapping promoted/relegated players
    const newTierMap = {};
    for (const player of leagueData.players) {
      if (!player.active || !player.tier) continue;
      newTierMap[player.id] = player.tier;
    }

    // Apply promotions (move up)
    for (const promo of promotions) {
      newTierMap[promo.player.id] = promo.toTier;
    }
    // Apply relegations (move down)
    for (const rel of relegations) {
      newTierMap[rel.player.id] = rel.toTier;
    }

    // Reset season stats, update tiers, accumulate career stats
    const newSeason = leagueData.league.currentSeason + 1;
    const updatedPlayers = leagueData.players.map(player => {
      const newTier = newTierMap[player.id] || player.tier;

      // Accumulate career stats
      const careerStats = player.careerStats || this.emptyCareerStats();
      const updatedCareer = {
        matchesPlayed: careerStats.matchesPlayed + (player.stats.matchesPlayed || 0),
        matchesWon: careerStats.matchesWon + (player.stats.matchesWon || 0),
        matchesLost: careerStats.matchesLost + (player.stats.matchesLost || 0),
        framesWon: careerStats.framesWon + (player.stats.framesWon || 0),
        framesLost: careerStats.framesLost + (player.stats.framesLost || 0),
        points: careerStats.points + (player.stats.points || 0),
        seasonsPlayed: (careerStats.seasonsPlayed || 0) + 1
      };

      return {
        ...player,
        tier: newTier,
        stats: this.emptySeasonStats(),
        careerStats: updatedCareer
      };
    });

    // Assign new tierRanks within each tier based on previous standings
    for (const tier of tiers) {
      const tierPlayers = updatedPlayers
        .filter(p => p.tier === tier && p.active)
        .sort((a, b) => {
          // Promoted players rank above relegated/staying players
          const aPromoted = promotions.some(pr => pr.player.id === a.id && pr.toTier === tier);
          const bPromoted = promotions.some(pr => pr.player.id === b.id && pr.toTier === tier);
          if (aPromoted && !bPromoted) return -1;
          if (!aPromoted && bPromoted) return 1;
          return (a.tierRank || 99) - (b.tierRank || 99);
        });

      tierPlayers.forEach((p, idx) => {
        const playerIdx = updatedPlayers.findIndex(up => up.id === p.id);
        if (playerIdx >= 0) {
          updatedPlayers[playerIdx] = { ...updatedPlayers[playerIdx], tierRank: idx + 1 };
        }
      });
    }

    // Build tier assignments for new season
    const tierAssignments = {};
    for (const tier of tiers) {
      tierAssignments[tier] = updatedPlayers
        .filter(p => p.tier === tier && p.active)
        .sort((a, b) => (a.tierRank || 0) - (b.tierRank || 0))
        .map(p => p.id);
    }

    // Add new season
    updatedSeasons.push({
      seasonNumber: newSeason,
      status: 'active',
      startedAt: new Date().toISOString(),
      completedAt: null,
      tierAssignments,
      promotions: [],
      relegations: [],
      finalStandings: null
    });

    return {
      ...leagueData,
      players: updatedPlayers,
      rounds: [],
      pairingHistory: [],
      seasons: updatedSeasons,
      league: {
        ...leagueData.league,
        currentSeason: newSeason,
        currentRound: 1,
        updatedAt: new Date().toISOString()
      }
    };
  }

  static emptySeasonStats() {
    return {
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      framesWon: 0,
      framesLost: 0,
      points: 0,
      frameDifference: 0,
      byesReceived: 0,
      forfeitsReceived: 0,
      forfeitsGiven: 0,
      strengthOfSchedule: 0,
      buchholzScore: 0
    };
  }

  static emptyCareerStats() {
    return {
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      framesWon: 0,
      framesLost: 0,
      points: 0,
      seasonsPlayed: 0
    };
  }

  /**
   * Initialize the first season for a tiered league.
   */
  static initializeSeason(leagueData) {
    const { tiers } = leagueData.league.tierConfig;
    const tierAssignments = {};
    for (const tier of tiers) {
      tierAssignments[tier] = leagueData.players
        .filter(p => p.tier === tier && p.active)
        .sort((a, b) => (a.tierRank || 0) - (b.tierRank || 0))
        .map(p => p.id);
    }

    // Initialize careerStats on all players
    const players = leagueData.players.map(p => ({
      ...p,
      careerStats: p.careerStats || this.emptyCareerStats()
    }));

    const season = {
      seasonNumber: 1,
      status: 'active',
      startedAt: new Date().toISOString(),
      completedAt: null,
      tierAssignments,
      promotions: [],
      relegations: [],
      finalStandings: null
    };

    return {
      ...leagueData,
      players,
      seasons: [season]
    };
  }
}
