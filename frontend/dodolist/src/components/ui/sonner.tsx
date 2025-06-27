import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps as SonnerToasterProps } from "sonner"

type ToasterProps = SonnerToasterProps & {
  activeColor?: {
    dark: string;
    darkText: string;
    light: string;
    border: string;
    text: string;
  };
};

const Toaster = ({ activeColor, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as SonnerToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      closeButton={true}
      style={
        {
          "--normal-bg": activeColor?.light,
          "--normal-text": activeColor?.text,
          "--normal-border": activeColor?.border,
          "--success-bg": activeColor?.light,
          "--success-text": activeColor?.text,
          "--success-border": activeColor?.border,
          "--error-bg": activeColor?.light,
          "--error-text": activeColor?.text,
          "--error-border": activeColor?.border,
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }