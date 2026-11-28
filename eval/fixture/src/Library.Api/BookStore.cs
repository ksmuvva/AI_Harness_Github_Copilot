public record Book(Guid Id, string Title, string Isbn);

// In-memory store for the eval sandbox. It is a singleton shared by all requests, so access is locked.
public class BookStore
{
    private readonly List<Book> _books = [];

    public void Add(Book book)
    {
        lock (_books) _books.Add(book);
    }

    public Book? FindByIsbn(string isbn)
    {
        lock (_books) return _books.FirstOrDefault(b => b.Isbn == isbn);
    }
}
