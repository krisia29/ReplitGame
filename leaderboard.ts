import { Router } from "express";
import { desc, sql, count } from "drizzle-orm";
import { db, usersTable, raceResultsTable, carsTable } from "@workspace/db";

const router = Router();

router.get("/leaderboard", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  const entries = await db
    .select({
      userId: usersTable.id,
      username: usersTable.username,
      points: usersTable.points,
      level: usersTable.level,
      avatarColor: usersTable.avatarColor,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.points))
    .limit(limit);

  // Get race stats per user
  const raceStats = await db
    .select({
      userId: raceResultsTable.userId,
      totalRaces: count(raceResultsTable.id),
      totalWins: sql<number>`SUM(CASE WHEN ${raceResultsTable.position} = 1 THEN 1 ELSE 0 END)::int`,
    })
    .from(raceResultsTable)
    .groupBy(raceResultsTable.userId);

  const statsMap = new Map(raceStats.map((s) => [s.userId, s]));

  // Get best car per user
  const bestCars = await db
    .select({
      userId: carsTable.userId,
      carName: carsTable.name,
    })
    .from(carsTable)
    .orderBy(desc(carsTable.totalWins));

  const bestCarMap = new Map<number, string>();
  for (const car of bestCars) {
    if (!bestCarMap.has(car.userId)) {
      bestCarMap.set(car.userId, car.carName);
    }
  }

  const result = entries.map((user, idx) => {
    const stats = statsMap.get(user.userId);
    return {
      rank: idx + 1,
      userId: user.userId,
      username: user.username,
      points: user.points,
      level: user.level,
      totalRaces: stats?.totalRaces ?? 0,
      totalWins: stats?.totalWins ?? 0,
      avatarColor: user.avatarColor ?? null,
      bestCarName: bestCarMap.get(user.userId) ?? null,
    };
  });

  res.json(result);
});

router.get("/leaderboard/stats", async (_req, res) => {
  const [totalPlayers] = await db.select({ count: count(usersTable.id) }).from(usersTable);
  const [totalRaces] = await db.select({ count: count(raceResultsTable.id) }).from(raceResultsTable);

  const topUser = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .orderBy(desc(usersTable.points))
    .limit(1);

  res.json({
    totalPlayers: totalPlayers?.count ?? 0,
    totalRaces: totalRaces?.count ?? 0,
    topSpeed: 312.7,
    weeklyChampion: topUser[0]?.username ?? null,
  });
});

export default router;
