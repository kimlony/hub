export type DartDisclosure = {
  corpName: string;
  title: string;
  publishedAt: Date;
  url: string;
};

export type DartApiResponse = {
  status: string;
  message?: string;
  list?: Array<{
    corp_name?: string;
    report_nm?: string;
    rcept_dt?: string;
    rcept_no?: string;
  }>;
};
