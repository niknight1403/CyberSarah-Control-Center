export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  MainTabs: undefined;
  Dashboard: undefined;
  Revenue: undefined;
  Hara: undefined;
  Content: undefined;
  Settings: undefined;
  Profile: undefined;
  WebView: { url: string; title: string };
  Payment: { productId: string; price: number };
  StripeCheckout: { sessionId: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Revenue: undefined;
  Hara: undefined;
  Content: undefined;
  Settings: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type ScreenNames = keyof RootStackParamList & keyof MainTabParamList;
