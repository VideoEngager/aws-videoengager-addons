import fs from "fs";
import path from "path";
import { waitForElement } from "./index";

const getForm = () => {
  return document.querySelector("#meetingForm");
};

export const submitForm = () => {
  const form = getForm();
  if (form) {
    form.querySelector('button')?.click();
  }
};

export const directSubmitForm = () => {
  const form = getForm();
  if (form) {
    form.submit();
  }
};

export const createMeetingSchedulerDOM = () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, "../ConnectSmartVideoAgentSchedule/schedule.html"),
    "utf8"
  );

  // Set the HTML content
  document.body.innerHTML = html;

  // CRITICAL: Execute the inline scripts to set up the actual JavaScript from the HTML file
  executeInlineScripts();

  // Trigger DOMContentLoaded event to initialize the form
  const domContentLoadedEvent = new Event("DOMContentLoaded");
  document.dispatchEvent(domContentLoadedEvent);
};

const executeInlineScripts = () => {
  // Find all script tags in the document
  const scripts = document.querySelectorAll("script");

  scripts.forEach((script) => {
    if (script.innerHTML.trim()) {
      try {
        // Execute the script content in the global scope
        // This is equivalent to what the browser does when it encounters a <script> tag
        const scriptFunction = new Function(script.innerHTML);
        scriptFunction.call(window);
      } catch (error) {
        console.error("Error executing inline script:", error);
        // For debugging, you might want to see which script failed
        console.log(
          "Failed script content:",
          script.innerHTML.substring(0, 200) + "..."
        );
      }
    }
  });
};

export const fillFormWithValidData = () => {
  // Set a future date for testing
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

  document.getElementById("meetingTitle").value = "Test Meeting";
  document.getElementById("startTime").value = futureDate
    .toISOString()
    .slice(0, 16);
  document.getElementById("duration").value = "30";
  document.getElementById("visitorName").value = "John Doe";
  document.getElementById("visitorEmail").value = "john@example.com";
  document.getElementById("visitorPhone").value = "+1234567890";
};

export const removeRequiredFromAllForms = () => {
  const form = getForm();
  const requiredFields = form?.querySelectorAll("[required]");

  requiredFields?.forEach((field) => {
    field.removeAttribute("required");
  });
};

export const validateNotificationMessage = async (message) => {
  const notificationContainer = await waitForElement("#notificationContainer");
  expect(notificationContainer).toBeTruthy();

  // Check that container has at least 1 child
  const notificationChild = await waitForElement("#notificationContainer > *");
  expect(notificationChild).toBeTruthy();

  // Get the last child element
  const lastNotificationChild = notificationContainer.lastElementChild;
  expect(lastNotificationChild).toBeTruthy();

  // Closing the notification
  expect(lastNotificationChild.textContent).toContain(message);
  lastNotificationChild.querySelector("button")?.click();
};
