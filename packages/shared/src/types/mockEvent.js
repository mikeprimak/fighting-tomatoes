"use strict";
// Mock Event Testing System Types
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESET_TIMESCALES = exports.DEFAULT_TIMESCALE = void 0;
exports.DEFAULT_TIMESCALE = {
    beforeEventStartDelay: 10,
    betweenFightsDelay: 120,
    roundDuration: 90,
    betweenRoundsDelay: 60,
    fightEndDelay: 20,
    speedMultiplier: 1,
};
exports.PRESET_TIMESCALES = {
    default: exports.DEFAULT_TIMESCALE,
    fast: {
        beforeEventStartDelay: 5,
        betweenFightsDelay: 60,
        roundDuration: 45,
        betweenRoundsDelay: 30,
        fightEndDelay: 10,
        speedMultiplier: 1,
    },
    'ultra-fast': {
        beforeEventStartDelay: 3,
        betweenFightsDelay: 30,
        roundDuration: 20,
        betweenRoundsDelay: 10,
        fightEndDelay: 5,
        speedMultiplier: 1,
    },
};
