import { forwardRef, type ComponentRef } from "react";
import { TextInput as RNTextInput, type TextInputProps } from "react-native";
import { fontFamily } from "./motion";

// Ô nhập chữ dùng font Be Vietnam Pro (các màn cũ chỉ cần đổi nơi nhập).
export const TextInput = forwardRef<
  ComponentRef<typeof RNTextInput>,
  TextInputProps
>(function TextInput({ style, ...rest }, ref) {
  return (
    <RNTextInput
      ref={ref}
      {...rest}
      style={[{ fontFamily: fontFamily.regular }, style]}
    />
  );
});
