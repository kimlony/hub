package hub.news.mapper;

import hub.news.domain.NewsRow;
import hub.news.NewsSearchCondition;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface NewsMapper {
    List<NewsRow> findList(@Param("cond") NewsSearchCondition cond);
    int countList(@Param("cond") NewsSearchCondition cond);
}
