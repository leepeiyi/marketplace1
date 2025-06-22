// cypress/e2e/quick_book_happy_path.cy.js

describe("Quick Book Happy Path", () => {
  const baseUrl = "http://localhost:3000"; // Adjust based on your frontend dev server
  const apiUrl = "http://localhost:3002"; // Adjust if your API runs on a different port

  it("Customer posts a Quick Book job and provider accepts it successfully", () => {
    // Step 1: Create a job via API (mimicking customer action)
    cy.request({
      method: "POST",
      url: `${apiUrl}/api/jobs/quick-book`,
      headers: {
        "x-user-id": "cmc7uqb9j000asozpa381palg", // Replace with a valid test customer ID
      },
      body: {
        categoryId: "cmc7uqb8n0001sozpkzp7ps7v",
        title: "Fix leaking pipe",
        description: "Kitchen sink leaking under cabinet",
        latitude: 1.3521,
        longitude: 103.8198,
        address: "123 Main St, Singapore",
        arrivalWindow: 2,
      },
    }).then((res) => {
      expect(res.status).to.eq(201);
      const job = res.body;
      expect(job).to.have.property("id");

      // Step 2: Simulate provider logging in and seeing the job
      cy.visit(baseUrl, {
        onBeforeLoad(win) {
          win.localStorage.setItem(
            "quickly_user", // ✅ match your actual key
            JSON.stringify({
              id: "cmc7uqbai000ksozpw9hmjye2",
              name: "Expert Pro Services (Tier A)",
              email: "provider1@quickly.com",
              role: "PROVIDER",
            })
          );
        },
      });

      // Step 3: Wait for job card to appear and accept it
      cy.contains("Fix leaking pipe", { timeout: 10000 }).should("exist");
      cy.contains("Accept Job").click();

      // Step 4: Check that it's added to My Jobs with BOOKED status
      cy.contains("My Jobs").scrollIntoView();
      cy.contains("Fix leaking pipe").should("exist");
      cy.contains("BOOKED").should("exist");
    });
  });
});
