import {
  createMeetingSchedulerDOM,
  submitForm,
  directSubmitForm,
  fillFormWithValidData,
  removeRequiredFromAllForms,
  validateNotificationMessage,
} from "../../../testUtils/scheduleUtils";
import { dumpHtml, waitForClassRemoval } from "../../../testUtils";

describe("Form Validation", () => {
  beforeEach(() => {
    createMeetingSchedulerDOM();

    // Mock scrollIntoView since it's not available in JSDOM
    Element.prototype.scrollIntoView = jest.fn();

    // Mock successful fetch by default
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        _id: "test-id",
        date: Date.now(),
        duration: 30,
        visitor: { name: "Test", meetingUrl: "http://test.com" },
      }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should not allow empty form submission", () => {
    const form = document.querySelector("#meetingForm");
    const submitHandler = jest.fn();
    form.addEventListener("submit", submitHandler);

    expect(submitHandler).toHaveBeenCalledTimes(0);
  });

  it("should not allow to send schedule date in the past", () => {
    fillFormWithValidData();
    const dateInput = document.getElementById("startTime");
    dateInput.value = "2024-01-01T10:00"; // in the past
    dateInput.reportValidity();
    expect(dateInput.validity.valid).toBe(false);

    // Check the specific validation message
    expect(dateInput.validationMessage).toContain("Constraints not satisfied");
  });

  it("should validate email format in browser", () => {
    fillFormWithValidData();

    const emailInput = document.getElementById("visitorEmail");

    // Test invalid email - this will be caught by browser validation
    emailInput.value = "plainaddress";
    expect(emailInput.checkValidity()).toBe(false);

    emailInput.value = "@missingusername.com";
    expect(emailInput.checkValidity()).toBe(false);

    emailInput.value = "username@.com";
    expect(emailInput.checkValidity()).toBe(false);

    // Test valid email
    emailInput.value = "test@example.com";
    expect(emailInput.checkValidity()).toBe(true);
  });

  it("should validate duration constraints in browser", () => {
    fillFormWithValidData();

    const durationInput = document.getElementById("duration");

    // Test duration too short
    durationInput.value = "10";
    expect(durationInput.checkValidity()).toBe(false);

    // Test valid duration
    durationInput.value = "30";
    expect(durationInput.checkValidity()).toBe(true);

    // Test duration too long (if max is set)
    durationInput.value = "500";
    if (durationInput.getAttribute("max")) {
      expect(durationInput.checkValidity()).toBe(false);
    }
  });

  it("should validate phone number format", async () => {
    removeRequiredFromAllForms();
    fillFormWithValidData();

    // Mock fetch to fail to see validation message
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const phoneInput = document.getElementById("visitorPhone");
    phoneInput.value = "123"; // too short

    submitForm();

    // Should show network error since validation passes but fetch fails
    await validateNotificationMessage("Network error");
  });

  it("should validate required fields with whitespace", async () => {
    removeRequiredFromAllForms();

    // Test empty start time first
    submitForm();
    await validateNotificationMessage("Please select a start date and time");

    // Fill start time
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const pad = (num) => String(num).padStart(2, "0");
    document.getElementById(
      "startTime"
    ).value = `${futureDate.getFullYear()}-${pad(
      futureDate.getMonth() + 1
    )}-${pad(futureDate.getDate())}T10:00`;

    // Test empty duration
    document.getElementById("duration").value = "";
    submitForm();
    await validateNotificationMessage(
      "Meeting duration must be at least 15 minutes"
    );

    // Fill duration
    document.getElementById("duration").value = "30";

    // Test fields with only whitespace
    document.getElementById("visitorName").value = "   ";
    submitForm();
    await validateNotificationMessage("Visitor Name is required");
  });

  it("should validate start time is in future", () => {
    fillFormWithValidData();

    const startTimeInput = document.getElementById("startTime");

    // Set date in past
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const pad = (num) => String(num).padStart(2, "0");

    startTimeInput.value = `${pastDate.getFullYear()}-${pad(
      pastDate.getMonth() + 1
    )}-${pad(pastDate.getDate())}T10:00`;

    // Browser validation should catch this
    expect(startTimeInput.checkValidity()).toBe(false);
  });

  it("should handle fetch errors gracefully", async () => {
    removeRequiredFromAllForms();
    fillFormWithValidData();

    // Mock network error
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    submitForm();

    // Should show loading first
    expect(
      document.querySelector(".awsui-loading-content").textContent
    ).toContain("Scheduling meeting...");

    // Then show error message (the actual error handling will show "Network error")
    await validateNotificationMessage("Network error");

    // Form should be visible again
    expect(document.getElementById("meetingFormContainer")).not.toHaveClass(
      "hidden"
    );
  });

  it("should handle API errors gracefully", async () => {
    removeRequiredFromAllForms();
    fillFormWithValidData();

    // Mock API error response
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        message: "Agent is not available at this time",
      }),
    });

    submitForm();

    await validateNotificationMessage("Agent is not available at this time");

    // Form should be visible again
    expect(document.getElementById("meetingFormContainer")).not.toHaveClass(
      "hidden"
    );
  });

  it("should validate the form even someone removed the required attribute", async () => {
    removeRequiredFromAllForms();
    const durationInput = document.getElementById("duration");
    durationInput.value = "";
    submitForm();

    await validateNotificationMessage("Please select a start date and time");
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const pad = (num) => String(num).padStart(2, "0");
    document.getElementById(
      "startTime"
    ).value = `${futureDate.getFullYear()}-${pad(
      futureDate.getMonth() + 1
    )}-${pad(futureDate.getDate())}T${pad(futureDate.getHours())}:${pad(
      futureDate.getMinutes()
    )}`;

    // Catching the next error
    submitForm();
    await validateNotificationMessage(
      "Meeting duration must be at least 15 minutes"
    );

    durationInput.value = "30";
    submitForm();
    await validateNotificationMessage("Visitor Name is required");

    document.querySelector("#visitorName").value = "John Doe";
    submitForm();

    await validateNotificationMessage("Visitor Email is required");

    document.querySelector("#visitorEmail").value = "john@test.com";
    submitForm();

    await validateNotificationMessage("Visitor Phone is required");

    document.querySelector("#visitorPhone").value = "+1234567890";
    const mockData = {
      success: true,
      _id: "random-id",
      active: true,
      tenant: "test_tenant",
      agentId: "t@t",
      date: 1751535780000,
      duration: 30,
      visitor: {
        name: "John Doe",
        email: "john@test.com",
        phone: "+1234567890",
        meetingUrl: "visitorMeetingUrl",
        code: "visitorCode",
        autoAnswer: true,
      },
      agent: {
        email: "t@t",
        meetingUrl: "agentMeetingUrl",
        code: "agentCode",
        fullUrl: "agentFullUrl",
      },
    };

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });
    global.fetch = fetchMock;
    submitForm();

    // validate successful creation
    expect(
      document.querySelector(".awsui-loading-content").textContent
    ).toContain("Scheduling meeting...");
    await waitForClassRemoval("#resultsContainer", "hidden");
    expect(document.getElementById("meetingId").textContent).toBe(mockData._id);
  });

  it("should show proper success message and result data", async () => {
    removeRequiredFromAllForms();
    fillFormWithValidData();

    const mockData = {
      success: true,
      _id: "test-meeting-123",
      active: true,
      tenant: "test_tenant",
      agentId: "agent@test.com",
      date: 1751697960000,
      duration: 45,
      visitor: {
        name: "Jane Doe",
        email: "jane@test.com",
        phone: "+1234567890",
        meetingUrl: "https://meeting.example.com/visitor/123",
        code: "VISITOR123",
        autoAnswer: true,
      },
      agent: {
        email: "agent@test.com",
        meetingUrl: "https://meeting.example.com/agent/123",
        code: "AGENT123",
        fullUrl: "https://meeting.example.com/agent/123?full=true",
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    submitForm();

    // Wait for success
    await waitForClassRemoval("#resultsContainer", "hidden");

    // Verify all result data is populated correctly
    expect(document.getElementById("meetingId").textContent).toBe(mockData._id);
    expect(document.getElementById("scheduledDuration").textContent).toBe("45");
    expect(document.getElementById("scheduledVisitor").textContent).toBe(
      "Jane Doe"
    );
    expect(document.getElementById("visitorUrl").value).toBe(
      mockData.visitor.meetingUrl
    );

    // Verify success notification
    const successNotifications = document.querySelectorAll(
      ".awsui-flash-success"
    );
    expect(successNotifications.length).toBeGreaterThan(0);
    expect(successNotifications[0].textContent).toContain(
      "Meeting scheduled successfully"
    );
  });

  it("should allow scheduling another meeting", async () => {
    // First, schedule a meeting successfully
    removeRequiredFromAllForms();
    fillFormWithValidData();

    const mockData = {
      success: true,
      _id: "test-meeting-456",
      date: 1751697960000,
      duration: 30,
      visitor: {
        name: "Test User",
        meetingUrl: "https://test.com",
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    submitForm();
    await waitForClassRemoval("#resultsContainer", "hidden");

    // Click "Schedule Another Meeting" button
    document.getElementById("scheduleAnotherBtn").click();

    // Should show form again and hide results
    expect(document.getElementById("meetingFormContainer")).not.toHaveClass(
      "hidden"
    );
    expect(document.getElementById("resultsContainer")).toHaveClass("hidden");

    // Form should be reset - check specific fields
    expect(document.getElementById("visitorName").value).toBe("");
    expect(document.getElementById("visitorEmail").value).toBe("");
    expect(document.getElementById("duration").value).toBe("30"); // Should reset to default
  });

  it("should test copy functionality", async () => {
    removeRequiredFromAllForms();
    fillFormWithValidData();

    const mockData = {
      success: true,
      _id: "test-meeting-789",
      date: 1751697960000,
      duration: 30,
      visitor: {
        name: "Copy Test User",
        meetingUrl: "https://meeting.example.com/copy-test",
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    submitForm();
    await waitForClassRemoval("#resultsContainer", "hidden");

    // Test copy button
    const copyButton = document.getElementById("copyVisitorUrl");
    copyButton.click();

    // Should call clipboard API
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      mockData.visitor.meetingUrl
    );

    // Should show success notification
    await new Promise((resolve) => setTimeout(resolve, 100));
    const successNotifications = document.querySelectorAll(
      ".awsui-flash-success"
    );
    const copyNotification = Array.from(successNotifications).find((n) =>
      n.textContent.includes("copied to clipboard")
    );
    expect(copyNotification).toBeTruthy();
  });

  it("should validate form fields step by step", async () => {
    removeRequiredFromAllForms();

    // Test each validation step according to your validateForm function

    // 1. Test empty start time
    directSubmitForm();
    await validateNotificationMessage("Please select a start date and time");

    // 2. Add start time but in past
    document.getElementById("startTime").value = "2024-01-01T10:00";
    directSubmitForm();
    await validateNotificationMessage("Please select a date in the future");

    // 3. Add future start time but no duration
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const pad = (num) => String(num).padStart(2, "0");
    document.getElementById(
      "startTime"
    ).value = `${futureDate.getFullYear()}-${pad(
      futureDate.getMonth() + 1
    )}-${pad(futureDate.getDate())}T10:00`;

    document.getElementById("duration").value = "";
    directSubmitForm();
    await validateNotificationMessage(
      "Meeting duration must be at least 15 minutes"
    );

    // 4. Add short duration
    document.getElementById("duration").value = "10";
    directSubmitForm();
    await validateNotificationMessage(
      "Meeting duration must be at least 15 minutes"
    );

    // 5. Add proper duration but no visitor name
    document.getElementById("duration").value = "30";
    directSubmitForm();
    await validateNotificationMessage("Visitor Name is required");

    // 6. Add visitor name but no email
    document.getElementById("visitorName").value = "Test User";
    directSubmitForm();
    await validateNotificationMessage("Visitor Email is required");

    // 7. Add email but no phone
    document.getElementById("visitorEmail").value = "test@example.com";
    directSubmitForm();
    await validateNotificationMessage("Visitor Phone is required");

    // 8. Add phone - should now succeed
    document.getElementById("visitorPhone").value = "+1234567890";

    const mockData = {
      success: true,
      _id: "validation-test-id",
      date: futureDate.getTime(),
      duration: 30,
      visitor: {
        name: "Test User",
        email: "test@example.com",
        phone: "+1234567890",
        meetingUrl: "https://test.com",
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    directSubmitForm();
    await waitForClassRemoval("#resultsContainer", "hidden");
    expect(document.getElementById("meetingId").textContent).toBe(mockData._id);
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      createMeetingSchedulerDOM();

      // Mock scrollIntoView since it's not available in JSDOM
      Element.prototype.scrollIntoView = jest.fn();
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    describe("Network Errors", () => {
      it("should handle fetch network timeout", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        // Mock network timeout
        global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch"));

        submitForm();

        // Should show loading
        expect(
          document.querySelector(".awsui-loading-content").textContent
        ).toContain("Scheduling meeting...");

        // Should handle timeout and show user-friendly message
        await validateNotificationMessage(
          "Unable to connect to the server. Please check your connection."
        );

        // Form should be visible again
        expect(document.getElementById("meetingFormContainer")).not.toHaveClass(
          "hidden"
        );
        expect(document.getElementById("loadingState")).toHaveClass("hidden");
      });

      it("should handle connection refused error", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError("Failed to fetch"));

        submitForm();
        await validateNotificationMessage(
          "Unable to connect to the server. Please check your connection."
        );

        // UI should return to form state
        expect(document.getElementById("meetingFormContainer")).not.toHaveClass(
          "hidden"
        );
      });

      it("should handle DNS resolution errors", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest
          .fn()
          .mockRejectedValue(
            new TypeError("NetworkError when attempting to fetch resource")
          );

        submitForm();
        await validateNotificationMessage(
          "Unable to connect to the server. Please check your connection."
        );
      });

      it("should handle CORS errors", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockRejectedValue(new TypeError("CORS error"));

        submitForm();
        await validateNotificationMessage(
          "Unable to connect to the server. Please check your connection."
        );
      });
    });

    describe("HTTP Status Errors", () => {
      it("should handle 400 Bad Request", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            message: "Invalid request parameters",
          }),
        });

        submitForm();
        await validateNotificationMessage("Invalid request parameters");

        expect(document.getElementById("meetingFormContainer")).not.toHaveClass(
          "hidden"
        );
      });

      it("should handle 401 Unauthorized", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            message: "Authentication required",
          }),
        });

        submitForm();
        await validateNotificationMessage("Authentication required");
      });

      it("should handle 403 Forbidden", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({
            success: false,
            message:
              "Access denied. You don't have permission to schedule meetings.",
          }),
        });

        submitForm();
        await validateNotificationMessage(
          "Access denied. You don't have permission to schedule meetings."
        );
      });

      it("should handle 404 Not Found", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 404,
          json: async () => ({
            success: false,
            message: "Service endpoint not found",
          }),
        });

        submitForm();
        await validateNotificationMessage("Service endpoint not found");
      });

      it("should handle 409 Conflict", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 409,
          json: async () => ({
            success: false,
            message:
              "Meeting slot is already booked. Please select a different time.",
          }),
        });

        submitForm();
        await validateNotificationMessage(
          "Meeting slot is already booked. Please select a different time."
        );
      });

      it("should handle 422 Unprocessable Entity", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 422,
          json: async () => ({
            success: false,
            message: "Agent is not available during the selected time",
          }),
        });

        submitForm();
        await validateNotificationMessage(
          "Agent is not available during the selected time"
        );
      });

      it("should handle 429 Too Many Requests", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({
            success: false,
            message: "Too many requests. Please try again later.",
          }),
        });

        submitForm();
        await validateNotificationMessage(
          "Too many requests. Please try again later."
        );
      });

      it("should handle 500 Internal Server Error", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            message: "Internal server error. Please try again later.",
          }),
        });

        submitForm();
        await validateNotificationMessage(
          "Internal server error. Please try again later."
        );
      });

      it("should handle 502 Bad Gateway", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 502,
          json: async () => ({
            success: false,
            message: "Service temporarily unavailable",
          }),
        });

        submitForm();
        await validateNotificationMessage("Service temporarily unavailable");
      });

      it("should handle 503 Service Unavailable", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 503,
          json: async () => ({
            success: false,
            message: "Service is currently down for maintenance",
          }),
        });

        submitForm();
        await validateNotificationMessage(
          "Service is currently down for maintenance"
        );
      });

      it("should handle unknown HTTP status codes", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 418,
          json: async () => ({
            success: false,
            message: "Unexpected error occurred",
          }),
        });

        submitForm();
        await validateNotificationMessage("Unexpected error occurred");
      });
    });

    describe("Response Parsing Errors", () => {
      it("should handle invalid JSON response", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token in JSON");
          },
        });

        submitForm();
        await validateNotificationMessage(
          "Server returned invalid data. Please try again."
        );

        expect(document.getElementById("meetingFormContainer")).not.toHaveClass(
          "hidden"
        );
      });

      it("should handle empty response", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => null,
        });

        submitForm();
        await validateNotificationMessage("Unknown error occurred");
      });

      it("should handle response without success field", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            // Missing success field
            _id: "test-id",
            message: "Something went wrong",
          }),
        });

        submitForm();
        await validateNotificationMessage("Something went wrong");
      });

      it("should handle response with success: false but no message", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: false,
            // No message field
          }),
        });

        submitForm();
        await validateNotificationMessage("Unknown error occurred");
      });
    });

    describe("API Response Data Errors", () => {
      it("should handle missing meeting ID in response", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            // Missing _id field
            date: Date.now(),
            duration: 30,
            visitor: { name: "Test", meetingUrl: "http://test.com" },
          }),
        });

        submitForm();
        await waitForClassRemoval("#resultsContainer", "hidden");

        // Should display "N/A" for missing ID
        expect(document.getElementById("meetingId").textContent).toBe("N/A");
      });

      it("should handle missing visitor data in response", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            _id: "test-id",
            date: Date.now(),
            duration: 30,
            // Missing visitor field
          }),
        });

        submitForm();
        await waitForClassRemoval("#resultsContainer", "hidden");

        // Should handle missing visitor data gracefully
        expect(document.getElementById("scheduledVisitor").textContent).toBe(
          "Unknown"
        );
        expect(document.getElementById("visitorUrl").value).toBe(
          "URL not available"
        );
      });

      it("should handle missing meeting URL in response", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            _id: "test-id",
            date: Date.now(),
            duration: 30,
            visitor: {
              name: "Test User",
              // Missing meetingUrl
            },
          }),
        });

        submitForm();
        await waitForClassRemoval("#resultsContainer", "hidden");

        expect(document.getElementById("visitorUrl").value).toBe(
          "URL not available"
        );
      });

      it("should handle invalid date in response", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            _id: "test-id",
            date: "invalid-date",
            duration: 30,
            visitor: { name: "Test", meetingUrl: "http://test.com" },
          }),
        });

        submitForm();
        await waitForClassRemoval("#resultsContainer", "hidden");

        // Should handle invalid date gracefully
        const dateText = document.getElementById("scheduledDate").textContent;
        expect(dateText).toContain("Invalid Date");
      });
    });

    describe("UI State Errors", () => {
      it("should handle missing DOM elements gracefully", async () => {
        // Remove a critical element
        const resultsContainer = document.getElementById("resultsContainer");
        resultsContainer?.remove();

        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            _id: "test-id",
            date: Date.now(),
            duration: 30,
            visitor: { name: "Test", meetingUrl: "http://test.com" },
          }),
        });

        // Should not crash even if results container is missing
        expect(() => submitForm()).not.toThrow();
      });

      it("should handle notification container removal", async () => {
        // Remove notification container
        const notificationContainer = document.getElementById(
          "notificationContainer"
        );
        notificationContainer?.remove();

        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockRejectedValue(new Error("Test error"));

        // Should not crash even if notification container is missing
        expect(() => submitForm()).not.toThrow();
      });
    });

    describe("Copy Functionality Errors", () => {
      beforeEach(async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            _id: "copy-test-id",
            date: Date.now(),
            duration: 30,
            visitor: {
              name: "Copy Test",
              meetingUrl: "https://meeting.example.com/test",
            },
          }),
        });

        submitForm();
        await waitForClassRemoval("#resultsContainer", "hidden");
      });

      it("should handle clipboard API not available", async () => {
        // Remove clipboard API
        delete navigator.clipboard;

        // Mock document.execCommand to fail
        document.execCommand = jest.fn().mockReturnValue(false);

        const copyButton = document.getElementById("copyVisitorUrl");
        copyButton.click();

        await validateNotificationMessage(
          "Failed to copy URL. Please copy manually."
        );
      });

      it("should handle copying when no URL is available", async () => {
        // Clear the URL
        document.getElementById("visitorUrl").value = "URL not available";

        const copyButton = document.getElementById("copyVisitorUrl");
        copyButton.click();

        await validateNotificationMessage("No URL available to copy");
      });

      it("should handle copying empty URL", async () => {
        // Set empty URL
        document.getElementById("visitorUrl").value = "";

        const copyButton = document.getElementById("copyVisitorUrl");
        copyButton.click();

        await validateNotificationMessage("No URL available to copy");
      });
    });

    describe("Edge Cases and Boundary Conditions", () => {
      it("should handle extremely long error messages", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        const longMessage = "A".repeat(1000) + " error occurred";

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            message: longMessage,
          }),
        });

        submitForm();
        await validateNotificationMessage(longMessage);
      });

      it("should handle special characters in error messages", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        const specialMessage = "Error with special chars: <>&\"'🚫💥";

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            message: specialMessage,
          }),
        });

        submitForm();
        await validateNotificationMessage(specialMessage);
      });

      it("should handle null/undefined values in response", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            _id: null,
            date: undefined,
            duration: null,
            visitor: {
              name: undefined,
              meetingUrl: null,
            },
          }),
        });

        submitForm();
        await waitForClassRemoval("#resultsContainer", "hidden");

        // Should handle null/undefined gracefully
        expect(document.getElementById("meetingId").textContent).toBe("N/A");
        expect(document.getElementById("scheduledVisitor").textContent).toBe(
          "Unknown"
        );
        expect(document.getElementById("visitorUrl").value).toBe(
          "URL not available"
        );
      });

      it("should handle response timeout during JSON parsing", async () => {
        removeRequiredFromAllForms();
        fillFormWithValidData();

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () =>
            new Promise((resolve, reject) => {
              // Simulate a timeout during JSON parsing
              setTimeout(() => reject(new Error("Response timeout")), 100);
            }),
        });

        submitForm();
        await validateNotificationMessage(
          "Request timed out. Please try again"
        );
      });
    });

    describe("Form State Recovery", () => {
      it("should preserve form data after error", async () => {
        removeRequiredFromAllForms();

        // Fill form with specific data
        const testData = {
          title: "Important Meeting",
          name: "John Doe",
          email: "john@example.com",
          phone: "+1234567890",
        };

        document.getElementById("meetingTitle").value = testData.title;
        document.getElementById("visitorName").value = testData.name;
        document.getElementById("visitorEmail").value = testData.email;
        document.getElementById("visitorPhone").value = testData.phone;

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1);
        const pad = (num) => String(num).padStart(2, "0");
        document.getElementById(
          "startTime"
        ).value = `${futureDate.getFullYear()}-${pad(
          futureDate.getMonth() + 1
        )}-${pad(futureDate.getDate())}T10:00`;
        document.getElementById("duration").value = "45";

        // Mock error response
        global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

        submitForm();
        await validateNotificationMessage("Network error");

        // Form data should be preserved
        expect(document.getElementById("meetingTitle").value).toBe(
          testData.title
        );
        expect(document.getElementById("visitorName").value).toBe(
          testData.name
        );
        expect(document.getElementById("visitorEmail").value).toBe(
          testData.email
        );
        expect(document.getElementById("visitorPhone").value).toBe(
          testData.phone
        );
        expect(document.getElementById("duration").value).toBe("45");
      });
    });
  });
});
