import { color } from '@/theme/tokens';

// Shared header styling for the consumer + admin stacks: native iOS headers with
// the title set in the app's Georgia serif on paper, and brand accent for the
// back button and header actions. Native headers give us correct top safe-area
// insets and an automatic back button on every pushed screen. Each screen sets
// its own `title` / header actions.
//
// NOTE: we use the compact (centered) title rather than iOS large titles —
// `headerLargeTitle` does not engage reliably on iOS 26.4 with the installed
// react-navigation native-stack (it falls back to a blank large-title area), so
// the dependable serif title is the compact one. Revisit large titles when
// react-navigation gains iOS 26 support.
//
// The @react-navigation/native-stack types aren't directly resolvable under the
// hoisted pnpm layout, so this is an untyped literal; the Stack prop validates it
// structurally.
export const headerScreenOptions = {
  headerStyle: { backgroundColor: color.paper },
  headerTitleStyle: { fontFamily: 'Georgia', color: color.ink },
  headerTintColor: color.brand,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: color.paper },
};
