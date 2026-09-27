import type { ReactElement, ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...rest }: IconProps & { children: ReactNode }): ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function PhoneIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M5 4h3l2 5-2.2 1.4a11 11 0 0 0 5.8 5.8L15 14l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    </Icon>
  );
}

export function HangUpIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M3 14.5c0-1.2.6-2.3 1.7-2.9a15.5 15.5 0 0 1 14.6 0c1.1.6 1.7 1.700 1.700 2.900v1a1.500 1.500 0 0 1-1.500 1.500h-2.300a1.500 1.500 0 0 1-1.500-1.200l-.4-1.900a9.500 9.500 0 0 0-6.600 0l-.4 1.900a1.500 1.500 0 0 1-1.500 1.200H4.500A1.500 1.500 0 0 1 3 15.500Z" />
    </Icon>
  );
}

export function MicIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.500a6.500 6.500 0 0 0 13 0M12 18v3" />
    </Icon>
  );
}

export function MicOffIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M9 9V6a3 3 0 0 1 5.700-1.300M15 10.500V11a3 3 0 0 1-4.600 2.500M5.500 11.500a6.500 6.500 0 0 0 10.400 5.200M18.500 11.500c0 .9-.2 1.800-.5 2.600M12 18v3M4 4l16 16" />
    </Icon>
  );
}

export function SendIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Icon>
  );
}

export function PanelIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="3.500" y="4.500" width="17" height="15" rx="2.500" />
      <path d="M14.500 4.500v15" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function BellIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M6 16.500V11a6 6 0 1 1 12 0v5.500l1.500 2h-15ZM10 21h4" />
    </Icon>
  );
}

export function BellOffIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M8.200 6.300A6 6 0 0 1 18 11v4M6 11v5.500l-1.500 2H17M10 21h4M4 4l16 16" />
    </Icon>
  );
}

export function MailIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="3.500" y="5.500" width="17" height="13" rx="2.500" />
      <path d="m4.500 7.500 7.500 5.500 7.500-5.500" />
    </Icon>
  );
}

export function RetryIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M4.500 12a7.500 7.500 0 1 0 2.300-5.400M4.500 4.500v3.500h3.500" />
    </Icon>
  );
}
