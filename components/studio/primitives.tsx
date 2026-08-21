import { IconSymbol } from "@/components/ui/icon-symbol";
import { ReactNode } from "react";
import { StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle } from "react-native";

type IconName = Parameters<typeof IconSymbol>[0]["name"];

export function StudioHeader({
  eyebrow,
  title,
  actionLabel,
  actionIcon,
  onAction,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.titleGroup}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      {actionLabel && actionIcon && onAction ? (
        <TouchableOpacity
          accessibilityLabel={actionLabel}
          activeOpacity={0.7}
          onPress={onAction}
          style={styles.iconButton}
        >
          <IconSymbol name={actionIcon} size={20} color="#F2F6FC" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "ready" | "warning" | "neutral" | "accent";
}) {
  const toneStyle: ViewStyle =
    tone === "ready"
      ? styles.readyBadge
      : tone === "warning"
        ? styles.warningBadge
        : tone === "accent"
          ? styles.accentBadge
          : styles.neutralBadge;
  const textStyle: TextStyle =
    tone === "ready"
      ? styles.readyText
      : tone === "warning"
        ? styles.warningText
        : tone === "accent"
          ? styles.accentText
          : styles.neutralText;

  return (
    <View style={[styles.badge, toneStyle]}>
      <Text style={[styles.badgeText, textStyle]}>{label}</Text>
    </View>
  );
}

export function StudioSection({
  label,
  title,
  trailing,
}: {
  label: string;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View>
        <Text style={styles.sectionLabel}>{label}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {trailing}
    </View>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
    >
      {icon ? <IconSymbol name={icon} size={18} color="#061119" /> : null}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function EmptySurface({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.emptySurface}>
      <View style={styles.emptyIcon}>
        <IconSymbol name={icon} size={23} color="#52D8FF" />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  titleGroup: { flexShrink: 1 },
  eyebrow: {
    color: "#99A7B8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  title: { color: "#F2F6FC", fontSize: 27, fontWeight: "800", letterSpacing: -0.7 },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#1A2330",
    borderColor: "#29384A",
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  badge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  readyBadge: { backgroundColor: "rgba(69,217,150,0.13)" },
  readyText: { color: "#45D996" },
  warningBadge: { backgroundColor: "rgba(246,186,94,0.15)" },
  warningText: { color: "#F6BA5E" },
  accentBadge: { backgroundColor: "rgba(82,216,255,0.14)" },
  accentText: { color: "#52D8FF" },
  neutralBadge: { backgroundColor: "#202B3A" },
  neutralText: { color: "#B9C4D1" },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionLabel: {
    color: "#718094",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  sectionTitle: { color: "#F2F6FC", fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#52D8FF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: "#061119", fontSize: 14, fontWeight: "800" },
  emptySurface: {
    alignItems: "center",
    backgroundColor: "#121823",
    borderColor: "#243247",
    borderRadius: 18,
    borderStyle: "dashed",
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 30,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: "#152837",
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    marginBottom: 14,
    width: 48,
  },
  emptyTitle: { color: "#F2F6FC", fontSize: 16, fontWeight: "800", marginBottom: 7 },
  emptyDescription: { color: "#99A7B8", fontSize: 13, lineHeight: 19, textAlign: "center" },
});
