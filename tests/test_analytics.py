import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "analytics"))
import rubicon_analytics as ra  # noqa: E402


class AnalyticsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        rows = [
            {"accountId": f"x{i}", "contactId": f"x{i}-c1", "offerId": "o1", "sector": "fitness" if i < 40 else "retail", "source": "s", "repId": "r",
             "calls": 2, "connected": i % 2 == 0, "conversation": i % 4 == 0, "meetingBooked": i % 8 == 0, "meetingHeld": i % 8 == 0, "won": i % 16 == 0,
             "wonAmountEUR": 1000 if i % 16 == 0 else 0, "objection": "price" if i % 4 == 0 and i % 8 else None, "lossReason": None,
             "enrichmentCostCents": 64, "simulated": True}
            for i in range(80)
        ]
        self.src = Path(self.tmp.name) / "o.json"
        self.src.write_text(json.dumps({"outcomes": rows}))

    def tearDown(self):
        self.tmp.cleanup()

    def test_funnel_denominators(self):
        db = sqlite3.connect(":memory:")
        self.assertEqual(ra.load(db, self.src), 80)
        f = ra.run_kpis(db)["funnel"][0]
        self.assertEqual(f["worked_accounts"], 80)
        self.assertAlmostEqual(f["connect_rate"], 0.5)
        self.assertAlmostEqual(f["conversation_rate"], 0.5)   # 20 / 40 connected
        self.assertAlmostEqual(f["meeting_rate"], 0.5)        # 10 / 20 conversations
        self.assertEqual(f["won_revenue_eur"], 5000)

    def test_wilson_bounds(self):
        lo, hi = ra.wilson(5, 10)
        self.assertTrue(0 < lo < 0.5 < hi < 1)
        self.assertIsNone(ra.wilson(0, 0))

    def test_hypotheses_never_change_rules(self):
        db = sqlite3.connect(":memory:")
        ra.load(db, self.src)
        for h in ra.hypotheses(ra.run_kpis(db)):
            self.assertTrue(h["rule_change"].startswith("none"))

    def test_schema_constraints(self):
        db = sqlite3.connect(":memory:")
        db.executescript((ROOT / "sql" / "schema.sql").read_text(encoding="utf-8"))
        db.execute("INSERT INTO workspaces VALUES ('w','W','FR','Europe/Paris','2026-11-19')")
        db.execute("INSERT INTO accounts (id, workspace_id, name) VALUES ('a','w','A')")
        with self.assertRaises(sqlite3.IntegrityError):  # Rappeler with zero calls
            db.execute("INSERT INTO contacts (id, workspace_id, account_id, first_name, last_name, status, calls_count) VALUES ('c','w','a','X','Y','Rappeler',0)")
        with self.assertRaises(sqlite3.IntegrityError):  # lost deal without reason
            db.execute("INSERT INTO opportunities (id, workspace_id, account_id, offer_id, stage, opened_at) VALUES ('o','w','a','o1','7. Perdu','2026-11-19')")

    def test_report_flags_simulation(self):
        out = Path(self.tmp.name) / "r" / "db.sqlite"
        ra.main(["x", str(self.src), "--db", str(out)])
        self.assertIn("SIMULATED DATA", (out.parent / "kpi-report.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
