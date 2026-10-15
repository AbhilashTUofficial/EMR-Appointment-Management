// The seed script creates accounts with a shared, known password. It runs without asking only against a local database.
const LOCAL_URI = /^mongodb:\/\/(?:[^/@]*@)?(?:localhost|127\.0\.0\.1|mongo)(?::\d+)?(?:\/|$)/;

export function assertSeedAllowed({ nodeEnv, mongoUri, allowSeed }: { nodeEnv?: string; mongoUri: string; allowSeed?: string }) {
  const local = nodeEnv !== "production" && LOCAL_URI.test(mongoUri);
  if (!local && allowSeed !== "1") {
    throw new Error("Refusing to seed a database that is not local. Set ALLOW_SEED=1 if you really mean to create the demo accounts there.");
  }
}
