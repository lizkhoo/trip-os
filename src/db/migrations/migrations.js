// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo
// Edits to this file are preserved across `drizzle-kit generate` runs only if you also
// register newly-generated migrations here manually. (generate rewrites it and drops
// this comment + the formatting — restore both when it does.)

import journal from './meta/_journal.json';
import m0000 from './0000_futuristic_nightshade.sql';
import m0001 from './0001_triggers_and_singletons.sql';
import m0002 from './0002_source_paste.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
  },
};
