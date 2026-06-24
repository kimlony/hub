package hub.news.service;

import hub.news.NewsSearchCondition;
import java.util.Map;

public interface NewsService {
    Map<String, Object> getNewsList(NewsSearchCondition cond);
}
