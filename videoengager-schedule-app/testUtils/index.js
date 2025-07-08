import fs from "fs";
import path from "path";

export const waitForElement = (selector, timeout = 1000) => {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
};

export const waitForClassRemoval = async (selector, className, timeout = 5000) => {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element with id ${selector} not found`);
  }
  
  const startTime = Date.now();
  
  while (element.classList.contains(className)) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout waiting for ${className} class to be removed`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return element;
}

export const dumpHtml = (content) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `dom_snapshot_${timestamp}.html`;

  const filePath = path.join(__dirname, filename);
  fs.writeFileSync(filePath, content, (err) => {
    if (err) {
      console.error("Error creating file:", err);
    } else {
      console.log(`File created successfully: ${filePath}`);
    }
  });
};
