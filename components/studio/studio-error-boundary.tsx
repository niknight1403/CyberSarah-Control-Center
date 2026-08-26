import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type StudioErrorBoundaryProps = { section: string; children: ReactNode };
type StudioErrorBoundaryState = { failed: boolean };

export class StudioErrorBoundary extends Component<StudioErrorBoundaryProps, StudioErrorBoundaryState> {
  state: StudioErrorBoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The fallback keeps the surrounding control surface usable without exposing internals.
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <View style={styles.card}><Text style={styles.title}>{this.props.section} ist vorübergehend nicht verfügbar.</Text><Text style={styles.text}>Die übrigen Funktionen bleiben verfügbar. Du kannst diesen Bereich sicher neu laden.</Text><TouchableOpacity accessibilityRole="button" activeOpacity={0.75} onPress={() => this.setState({ failed: false })} style={styles.button}><Text style={styles.buttonText}>Bereich neu laden</Text></TouchableOpacity></View>;
  }
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#21161C", borderColor: "#744352", borderRadius: 16, borderWidth: 1, marginBottom: 22, padding: 14 },
  title: { color: "#FFD0D6", fontSize: 13, fontWeight: "900" },
  text: { color: "#C7A8AF", fontSize: 11, lineHeight: 16, marginTop: 5 },
  button: { alignItems: "center", borderColor: "#A55A6B", borderRadius: 10, borderWidth: 1, justifyContent: "center", marginTop: 11, minHeight: 44, paddingHorizontal: 12 },
  buttonText: { color: "#FFB4BE", fontSize: 12, fontWeight: "900" },
});
