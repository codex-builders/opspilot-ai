import unittest

from fastapi.testclient import TestClient

from backend.app import app


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_incident_list(self):
        response = self.client.get("/incidents")
        self.assertEqual(response.status_code, 200)
        incidents = response.json()
        self.assertEqual(len(incidents), 5)
        self.assertEqual(incidents[0]["id"], "INC-1001")

    def test_unknown_incident(self):
        response = self.client.get("/incidents/INC-9999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Incident not found")

    def test_incident_triage(self):
        response = self.client.get("/triage-incident", params={"incident_id": "INC-1001"})
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["incident"]["id"], "INC-1001")
        self.assertTrue(result["evidence"])
        self.assertTrue(result["timeline"])
        self.assertTrue(result["teams_status_update"])

    def test_operational_briefings(self):
        morning = self.client.get("/morning-briefing")
        cab = self.client.get("/cab-briefing")
        self.assertEqual(morning.status_code, 200)
        self.assertTrue(morning.json()["priorities"])
        self.assertEqual(cab.status_code, 200)
        self.assertTrue(cab.json()["scheduled_changes"])


if __name__ == "__main__":
    unittest.main()
