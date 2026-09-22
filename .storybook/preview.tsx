import React from "react";
import "../src/tokens/index.css";
import { THEMES } from "../src/tokens/themes";

const defaultTheme = THEMES[0] ?? "baseline";

const preview = {
  globalTypes: {
    theme: {
      description: "Design system theme",
      defaultValue: defaultTheme,
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: THEMES,
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story: any, context: any) => {
      const theme = context.globals.theme || defaultTheme;
      return (
        <div data-theme={theme} style={{ padding: "1.5rem" }}>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
